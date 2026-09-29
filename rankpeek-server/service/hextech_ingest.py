#!/usr/bin/env python3
"""RankPeek 海斗数据接收服务（自建，去标识）。

设计红线（见仓库根目录 PRIVACY.md）：
- 只接收白名单字段；出现任何白名单外的字段，整包拒绝
- 明细不落库：不保存"哪一局、哪几个玩家"，只保存匿名的
  「install × 英雄 × 强化」计数（actor_cell）；matrix 由它派生，出问题能整批删掉重算
- 不接收任何可定位到个人的字段（PUUID / gameName / tagLine / summonerId / 聊天）
- installId 不落库：服务端只保存 sha256(installId + 服务端盐)

接口：
    GET  /health
    POST /api/v1/upload/batch          匿名对局（英雄 + 强化 + 胜负）
    POST /api/v1/telemetry/heartbeat   日活心跳

只监听回环地址，由 nginx 反代；写接口要求带共享密钥头（由 Cloudflare Worker 代理注入）。
"""
import base64
import hashlib
import hmac
import json
import os
import re
import sqlite3
import sys
import threading
import time
from contextlib import closing
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SCHEMA_VERSION = 1
CN_TZ = timezone(timedelta(hours=8))
QUEUE_HEXTECH_ARAM = 2400
MAX_GAMES_PER_BATCH = 5
MAX_PLAYERS_PER_GAME = 10
MAX_AUGMENTS_PER_PLAYER = 4
MAX_BODY_BYTES = 64 * 1024
DAILY_UPLOAD_LIMIT = 20          # 每个 install 每天最多上传次数
# 每个来源 IP 每天最多上传次数。10 太小了：一个玩家一天打十几把、每批最多 3 局，
# 很容易顶到上限，界面上就会显示"上传失败 429" —— 看着像坏了。install 自己还有 20 次/天的闸门，
# 这里放到 60 只挡"同一出口 IP 大量客户端刷数据"。
DAILY_IP_UPLOAD_LIMIT = 60
DAILY_IP_HEARTBEAT_LIMIT = 120   # 心跳比上传频繁，放到 120

# 去重记录（uploaded_games）只保留 48 小时。这个数字是对玩家明说的
# （客户端贡献弹窗里的示例写着「服务器只留 48 小时」），所以必须真的删。
GAME_KEY_RETENTION_HOURS = 48
PURGE_MIN_INTERVAL_SECONDS = 1800
_last_purge_at = 0.0

# 短期上传会话：客户端先换一个不透明 token，再拿它上传。
# 这挡不住铁了心伪造数据的人，但把"随手换个 installId 就能刷"变成"得先来换 token"，
# 而且给了服务端一个能限流、能吊销、能按会话记额度的抓手。
SESSION_TTL_SECONDS = 2 * 60 * 60        # token 两小时有效
SESSION_BATCH_LIMIT = 40                 # 一个会话最多传多少批
SESSION_ISSUE_LIMIT_PER_IP = 12          # 每个来源 IP 每天最多申请多少次会话

INSTALL_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
GAME_KEY_RE = re.compile(r"^[0-9a-f]{64}$")
PATCH_RE = re.compile(r"^[0-9]{1,3}\.[0-9]{1,3}$")

TOP_LEVEL_KEYS = {"schemaVersion", "installId", "appVersion", "platform", "games"}
GAME_KEYS = {"gameKey", "patch", "queueId", "durationSec", "playedAt", "players"}
PLAYER_KEYS = {"championId", "augmentIds", "win"}
HEARTBEAT_KEYS = {"installId", "day", "version", "patch", "mode", "os"}
FORBIDDEN_KEYS = {
    "puuid", "gamename", "tagline", "summonerid", "accountid", "summonername",
    "riotid", "chat", "messages", "email", "phone",
}

DDL = """
CREATE TABLE IF NOT EXISTS augment_counters (
  patch       TEXT    NOT NULL,
  champion_id INTEGER NOT NULL,
  augment_id  INTEGER NOT NULL,
  wins        INTEGER NOT NULL DEFAULT 0,
  games       INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT    NOT NULL,
  PRIMARY KEY (patch, champion_id, augment_id)
);
CREATE TABLE IF NOT EXISTS augment_offers (
  patch      TEXT    NOT NULL,
  augment_id INTEGER NOT NULL,
  offers     INTEGER NOT NULL DEFAULT 0,
  rerolled   INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT    NOT NULL,
  PRIMARY KEY (patch, augment_id)
);
-- 匿名明细层：谁（install_hash）在哪个 英雄 x 强化 上贡献了几胜几负。
-- 有了它，matrix 就能整份重算：删掉某个 install / 某个客户端版本的行，再跑一次聚合即可，
-- 不需要存"哪一局、哪几个玩家"（那样就等于存了可关联的明细）。
-- client_version 进主键：客户端升级后同一格子可以分开记，出问题的版本能整批摘掉。
CREATE TABLE IF NOT EXISTS actor_cell (
  patch          TEXT    NOT NULL,
  champion_id    INTEGER NOT NULL,
  augment_id     INTEGER NOT NULL,
  install_hash   TEXT    NOT NULL,
  client_version TEXT    NOT NULL DEFAULT '',
  wins           INTEGER NOT NULL DEFAULT 0,
  games          INTEGER NOT NULL DEFAULT 0,
  updated_at     TEXT    NOT NULL,
  PRIMARY KEY (patch, champion_id, augment_id, install_hash, client_version)
);
CREATE INDEX IF NOT EXISTS idx_actor_cell_patch ON actor_cell (patch);
CREATE INDEX IF NOT EXISTS idx_actor_cell_install ON actor_cell (install_hash);
CREATE TABLE IF NOT EXISTS game_totals (
  patch            TEXT    NOT NULL PRIMARY KEY,
  games            INTEGER NOT NULL DEFAULT 0,
  player_rows      INTEGER NOT NULL DEFAULT 0,
  duration_sec_sum INTEGER NOT NULL DEFAULT 0,
  updated_at       TEXT    NOT NULL
);
CREATE TABLE IF NOT EXISTS heartbeats (
  install_hash TEXT NOT NULL,
  day          TEXT NOT NULL,
  version      TEXT,
  patch        TEXT,
  mode         TEXT,
  os           TEXT,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (install_hash, day)
);
CREATE TABLE IF NOT EXISTS uploaded_games (
  game_key     TEXT PRIMARY KEY,
  patch        TEXT,
  queue_id     INTEGER,
  duration_sec INTEGER,
  played_at    INTEGER,
  install_hash TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_uploaded_games_created ON uploaded_games (created_at);
"""


class ValidationError(Exception):
    """请求不符合白名单契约。"""


def now_iso():
    return datetime.now(CN_TZ).isoformat(timespec="seconds")


def today_cn():
    return datetime.now(CN_TZ).strftime("%Y-%m-%d")


def connect(db_path):
    conn = sqlite3.connect(db_path, timeout=10.0)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def init_db(db_path):
    parent = os.path.dirname(os.path.abspath(db_path))
    if parent:
        os.makedirs(parent, exist_ok=True)
    with closing(connect(db_path)) as conn:
        conn.executescript(DDL)
        conn.commit()


def hash_install(install_id, salt):
    digest = hashlib.sha256()
    digest.update(salt.encode("utf-8"))
    digest.update(b"\x1f")
    digest.update(install_id.encode("utf-8"))
    return digest.hexdigest()


def reject_forbidden(payload):
    """整包扫描禁止字段（含嵌套），命中即拒绝。"""
    stack = [payload]
    while stack:
        node = stack.pop()
        if isinstance(node, dict):
            for key, value in node.items():
                if str(key).lower() in FORBIDDEN_KEYS:
                    raise ValidationError("field not allowed: %s" % key)
                stack.append(value)
        elif isinstance(node, list):
            stack.extend(node)


def require_keys(node, allowed, where):
    if not isinstance(node, dict):
        raise ValidationError("%s must be an object" % where)
    unknown = sorted(set(node.keys()) - allowed)
    if unknown:
        raise ValidationError("%s has unknown field(s): %s" % (where, ", ".join(unknown)))


def require_int(value, low, high, where):
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValidationError("%s must be an integer" % where)
    if value < low or value > high:
        raise ValidationError("%s out of range" % where)
    return value


def validate_batch(payload):
    if not isinstance(payload, dict):
        raise ValidationError("body must be a JSON object")
    reject_forbidden(payload)
    require_keys(payload, TOP_LEVEL_KEYS, "body")

    if payload.get("schemaVersion") != SCHEMA_VERSION:
        raise ValidationError("unsupported schemaVersion")

    # installId 现在可以不带：身份由短期会话 token 决定（token 里已经有 install_hash），
    # 批次再自报一个 installId 只会给伪造留口子。带了就顺手校验格式。
    install_id = payload.get("installId")
    if install_id is not None:
        if not isinstance(install_id, str) or not INSTALL_ID_RE.match(install_id):
            raise ValidationError("invalid installId")

    games = payload.get("games")
    if not isinstance(games, list) or not games:
        raise ValidationError("games must be a non-empty array")
    if len(games) > MAX_GAMES_PER_BATCH:
        raise ValidationError("too many games in one batch")

    cleaned = []
    for index, game in enumerate(games):
        where = "games[%d]" % index
        require_keys(game, GAME_KEYS, where)

        game_key = game.get("gameKey")
        if not isinstance(game_key, str) or not GAME_KEY_RE.match(game_key):
            raise ValidationError("%s.gameKey must be a sha256 hex string" % where)

        patch = game.get("patch")
        if not isinstance(patch, str) or not PATCH_RE.match(patch):
            raise ValidationError("%s.patch is invalid" % where)

        queue_id = require_int(game.get("queueId"), 0, 9999, where + ".queueId")
        if queue_id != QUEUE_HEXTECH_ARAM:
            raise ValidationError("%s.queueId is not supported" % where)

        # 时长是可选的：新客户端不再上传它（聚合用不到），老客户端还在传
        duration = game.get("durationSec")
        duration = 0 if duration is None else require_int(duration, 0, 7200, where + ".durationSec")
        played_at = game.get("playedAt")
        if played_at is not None:
            played_at = require_int(played_at, 0, 4102444800000, where + ".playedAt")

        players = game.get("players")
        if not isinstance(players, list) or not players:
            raise ValidationError("%s.players must be a non-empty array" % where)
        if len(players) > MAX_PLAYERS_PER_GAME:
            raise ValidationError("%s.players is too large" % where)

        clean_players = []
        for p_index, player in enumerate(players):
            p_where = "%s.players[%d]" % (where, p_index)
            require_keys(player, PLAYER_KEYS, p_where)
            champion_id = require_int(player.get("championId"), 1, 1000, p_where + ".championId")
            win = player.get("win")
            if not isinstance(win, bool):
                raise ValidationError(p_where + ".win must be a boolean")
            augment_ids = player.get("augmentIds")
            if not isinstance(augment_ids, list):
                raise ValidationError(p_where + ".augmentIds must be an array")
            if len(augment_ids) > MAX_AUGMENTS_PER_PLAYER:
                raise ValidationError(p_where + ".augmentIds is too large")
            seen = []
            for a_index, augment_id in enumerate(augment_ids):
                value = require_int(augment_id, 1, 1000000, "%s.augmentIds[%d]" % (p_where, a_index))
                if value not in seen:
                    seen.append(value)
            clean_players.append({"championId": champion_id, "augmentIds": seen, "win": win})

        cleaned.append({
            "gameKey": game_key,
            "patch": patch,
            "queueId": queue_id,
            "durationSec": duration,
            "playedAt": played_at,
            "players": clean_players,
        })

    return install_id, cleaned


def validate_heartbeat(payload):
    if not isinstance(payload, dict):
        raise ValidationError("body must be a JSON object")
    reject_forbidden(payload)
    require_keys(payload, HEARTBEAT_KEYS, "body")

    install_id = payload.get("installId")
    if not isinstance(install_id, str) or not INSTALL_ID_RE.match(install_id):
        raise ValidationError("invalid installId")

    day = payload.get("day")
    if not isinstance(day, str) or not re.match(r"^\d{4}-\d{2}-\d{2}$", day):
        raise ValidationError("invalid day")

    def optional_text(key, limit):
        value = payload.get(key)
        if value is None:
            return None
        if not isinstance(value, str) or len(value) > limit:
            raise ValidationError("invalid %s" % key)
        return value

    return install_id, {
        "day": day,
        "version": optional_text("version", 32),
        "patch": optional_text("patch", 16),
        "mode": optional_text("mode", 32),
        "os": optional_text("os", 32),
    }


def purge_expired_games(conn, force=False):
    """删掉超过 48 小时的对局去重记录。

    gameKey 里掺了「对局发生的自然日」，48 小时内同一局一定算出同一个键，所以清理不会让
    同一局被重复计数；客户端本地也记着哪些对局已经传过，不会主动重传。

    返回删除的行数。
    """
    global _last_purge_at
    now = time.time()
    if not force and now - _last_purge_at < PURGE_MIN_INTERVAL_SECONDS:
        return 0
    _last_purge_at = now
    cutoff = (datetime.now(CN_TZ) - timedelta(hours=GAME_KEY_RETENTION_HOURS)).isoformat(timespec="seconds")
    cursor = conn.cursor()
    cursor.execute("DELETE FROM uploaded_games WHERE created_at < ?", (cutoff,))
    return cursor.rowcount


def ingest_batch(conn, games, install_hash, stamp, client_version=""):
    accepted = 0
    duplicates = 0
    players_counted = 0
    counter_rows = 0

    cursor = conn.cursor()
    acknowledgements = []
    for game in games:
        cursor.execute(
            "INSERT OR IGNORE INTO uploaded_games"
            " (game_key, patch, queue_id, duration_sec, played_at, install_hash, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (game["gameKey"], game["patch"], game["queueId"], game["durationSec"],
             game["playedAt"], install_hash, stamp),
        )
        if cursor.rowcount == 0:
            duplicates += 1
            # 逐条回执：一条坏数据或一条重复不该影响同一批里的其它对局
            acknowledgements.append({"gameKey": game["gameKey"], "status": "duplicate"})
            continue

        accepted += 1
        acknowledgements.append({"gameKey": game["gameKey"], "status": "inserted"})
        players_counted += len(game["players"])
        for player in game["players"]:
            won = 1 if player["win"] else 0
            for augment_id in player["augmentIds"]:
                # 只写匿名明细层；matrix 由 aggregate_hextech.py 从这里整份重算
                cursor.execute(
                    "INSERT INTO actor_cell"
                    " (patch, champion_id, augment_id, install_hash, client_version, wins, games, updated_at)"
                    " VALUES (?, ?, ?, ?, ?, ?, 1, ?)"
                    " ON CONFLICT(patch, champion_id, augment_id, install_hash, client_version)"
                    " DO UPDATE SET"
                    "   wins = wins + excluded.wins,"
                    "   games = games + 1,"
                    "   updated_at = excluded.updated_at",
                    (game["patch"], player["championId"], augment_id, install_hash,
                     client_version, won, stamp),
                )
                counter_rows += 1

        cursor.execute(
            "INSERT INTO game_totals (patch, games, player_rows, duration_sec_sum, updated_at)"
            " VALUES (?, 1, ?, ?, ?)"
            " ON CONFLICT(patch) DO UPDATE SET"
            "   games = games + 1,"
            "   player_rows = player_rows + excluded.player_rows,"
            "   duration_sec_sum = duration_sec_sum + excluded.duration_sec_sum,"
            "   updated_at = excluded.updated_at",
            (game["patch"], len(game["players"]), game["durationSec"], stamp),
        )

    purged = purge_expired_games(conn)
    conn.commit()
    return {
        "accepted": accepted,
        "duplicates": duplicates,
        "playersCounted": players_counted,
        "counterRows": counter_rows,
        "purged": purged,
        "acknowledgements": acknowledgements,
    }


def record_heartbeat(conn, install_hash, beat, stamp):
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR IGNORE INTO heartbeats"
        " (install_hash, day, version, patch, mode, os, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (install_hash, beat["day"], beat["version"], beat["patch"], beat["mode"], beat["os"], stamp),
    )
    inserted = cursor.rowcount
    conn.commit()
    return {"recorded": bool(inserted)}


class SessionStore:
    """短期上传会话（只存内存，重启即失效，客户端会重新申请）。

    token 是 256 位随机数，服务端只留它的 sha256 —— 和 installId 一样不落明文。
    """

    def __init__(self, salt, ttl_seconds=SESSION_TTL_SECONDS, batch_limit=SESSION_BATCH_LIMIT):
        self.salt = salt
        self.ttl_seconds = ttl_seconds
        self.batch_limit = batch_limit
        self.lock = threading.Lock()
        self.by_hash = {}

    def issue(self, install_hash, now=None):
        now = time.time() if now is None else now
        token = base64.urlsafe_b64encode(os.urandom(32)).decode("ascii").rstrip("=")
        token_hash = hashlib.sha256((self.salt + ":" + token).encode("utf-8")).hexdigest()
        expires_at = now + self.ttl_seconds
        with self.lock:
            self._prune(now)
            self.by_hash[token_hash] = {
                "install_hash": install_hash,
                "expires_at": expires_at,
                "batches": 0,
            }
        return token, expires_at

    def resolve(self, token, now=None):
        """返回会话；不存在或过期返回 None。"""
        if not isinstance(token, str) or not token:
            return None
        now = time.time() if now is None else now
        token_hash = hashlib.sha256((self.salt + ":" + token).encode("utf-8")).hexdigest()
        with self.lock:
            session = self.by_hash.get(token_hash)
            if session is None:
                return None
            if session["expires_at"] <= now:
                self.by_hash.pop(token_hash, None)
                return None
            if session["batches"] >= self.batch_limit:
                return None
            session["batches"] += 1
            return dict(session)

    def _prune(self, now):
        for key in [k for k, v in self.by_hash.items() if v["expires_at"] <= now]:
            self.by_hash.pop(key, None)


class RateLimiter:
    """内存限流：每个 install 每天最多 N 次上传。重启即清零，够用。"""

    def __init__(self, limit):
        self.limit = limit
        self.lock = threading.Lock()
        self.buckets = {}

    def allow(self, key):
        day = today_cn()
        with self.lock:
            bucket_day, count = self.buckets.get(key, (day, 0))
            if bucket_day != day:
                bucket_day, count = day, 0
            if count >= self.limit:
                self.buckets[key] = (bucket_day, count)
                return False
            self.buckets[key] = (bucket_day, count + 1)
            return True


class IngestServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, handler, config):
        super().__init__(address, handler)
        self.config = config


class IngestHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "RankPeekIngest/1.0"

    @property
    def config(self):
        return self.server.config

    def ip_tag(self):
        """日志里只留按天加盐的 IP 摘要。

        对外说的是"不收集能定位到个人的信息"，那日志里就不该躺着明文 IP：
        摘要当天可以用来排查同一个来源，跨天就再也对不上。
        """
        try:
            material = ("%s:%s" % (self.config["salt"], today_cn())).encode("utf-8")
            digest = hmac.new(material, self.client_ip().encode("utf-8"), hashlib.sha256)
            return digest.hexdigest()[:12]
        except Exception:
            return "-"

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s %s\n" % (now_iso(), self.ip_tag(), fmt % args))
        sys.stderr.flush()

    def do_GET(self):
        if self.path.split("?")[0] == "/health":
            with closing(connect(self.config["db"])) as conn:
                counters = conn.execute(
                    "SELECT COUNT(*) FROM actor_cell").fetchone()[0]
                games = conn.execute("SELECT COUNT(*) FROM uploaded_games").fetchone()[0]
            self.send_json(200, {"success": True, "data": {
                "status": "ok",
                "counterRows": counters,
                "games": games,
                "time": now_iso(),
            }})
            return
        self.send_json(404, {"success": False, "error": {"code": "not_found"}})

    def do_POST(self):
        path = self.path.split("?")[0]
        if path not in ("/api/v1/upload/session", "/api/v1/upload/batch",
                        "/api/v1/telemetry/heartbeat"):
            self.send_json(404, {"success": False, "error": {"code": "not_found"}})
            return
        if not self.authorized():
            self.send_json(401, {"success": False, "error": {"code": "unauthorized"}})
            return

        try:
            payload = self.read_json_body()
        except ValidationError as error:
            self.send_json(400, {"success": False, "error": {"code": "bad_request", "message": str(error)}})
            return

        try:
            if path == "/api/v1/upload/session":
                self.handle_session(payload)
            elif path == "/api/v1/upload/batch":
                self.handle_batch(payload)
            else:
                self.handle_heartbeat(payload)
        except ValidationError as error:
            self.send_json(400, {"success": False, "error": {"code": "invalid_payload", "message": str(error)}})
        except sqlite3.Error as error:
            self.log_message("sqlite error: %s", error)
            self.send_json(500, {"success": False, "error": {"code": "storage_error"}})

    def authorized(self):
        secret = self.config["secret"]
        if not secret:
            # 未配置共享密钥（直连模式）：服务只监听回环，公网流量必须经 nginx 反代，
            # nginx 会重写 X-Real-IP，所以来源 IP 在这里仍然可信。
            return True
        supplied = self.headers.get("X-RankPeek-Proxy") or ""
        return hmac.compare_digest(secret, supplied)

    def client_ip(self):
        forwarded = (self.headers.get("X-Real-IP") or "").strip()
        return forwarded or self.client_address[0]

    def bearer_token(self):
        header = self.headers.get("Authorization") or ""
        if not header.lower().startswith("bearer "):
            return ""
        return header[7:].strip()

    def read_json_body(self):
        raw_length = self.headers.get("Content-Length")
        if raw_length is None:
            raise ValidationError("Content-Length is required")
        try:
            length = int(raw_length)
        except ValueError:
            raise ValidationError("invalid Content-Length")
        if length <= 0:
            raise ValidationError("empty body")
        if length > MAX_BODY_BYTES:
            raise ValidationError("body too large")
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ValidationError("body is not valid JSON")

    def handle_session(self, payload):
        """签发短期上传会话。

        这是写接口里唯一不需要 token 的入口，所以它自己必须被限流 ——
        否则"批量造 token"就只是比"批量造 installId"多一步。
        """
        install_id = payload.get("installId")
        if not isinstance(install_id, str) or not INSTALL_ID_RE.match(install_id):
            raise ValidationError("invalid installId")
        install_hash = hash_install(install_id, self.config["salt"])
        ip_hash = hash_install(self.client_ip(), self.config["salt"])
        if not self.config["session_limiter"].allow(ip_hash):
            self.send_json(429, {"success": False, "error": {"code": "rate_limited_ip"}})
            return
        token, expires_at = self.config["sessions"].issue(install_hash)
        self.log_message("session issued install=%s", install_hash[:12])
        self.send_json(200, {"success": True, "data": {
            "token": token,
            "expiresAt": datetime.fromtimestamp(expires_at, CN_TZ).isoformat(timespec="seconds"),
            "maxBatchSize": MAX_GAMES_PER_BATCH,
            "maxBodyBytes": MAX_BODY_BYTES,
        }})

    def handle_batch(self, payload):
        # 身份只认 token：批次自己报的 installId 不再作为凭据
        session = self.config["sessions"].resolve(self.bearer_token())
        if session is None:
            self.send_json(401, {"success": False, "error": {"code": "invalid_session"}})
            return
        _, games = validate_batch(payload)
        install_hash = session["install_hash"]
        ip_hash = hash_install(self.client_ip(), self.config["salt"])
        if not self.config["ip_limiter"].allow(ip_hash):
            self.send_json(429, {"success": False, "error": {"code": "rate_limited_ip"}})
            return
        if not self.config["limiter"].allow(install_hash):
            self.send_json(429, {"success": False, "error": {"code": "rate_limited"}})
            return
        stamp = now_iso()
        client_version = payload.get("appVersion")
        client_version = client_version[:32] if isinstance(client_version, str) else ""
        with closing(connect(self.config["db"])) as conn:
            result = ingest_batch(conn, games, install_hash, stamp, client_version)
        self.log_message("batch accepted=%d duplicates=%d players=%d",
                         result["accepted"], result["duplicates"], result["playersCounted"])
        self.send_json(200, {"success": True, "data": result})

    def handle_heartbeat(self, payload):
        install_id, beat = validate_heartbeat(payload)
        install_hash = hash_install(install_id, self.config["salt"])
        if not self.config["heartbeat_limiter"].allow(hash_install(self.client_ip(), self.config["salt"])):
            self.send_json(429, {"success": False, "error": {"code": "rate_limited_ip"}})
            return
        with closing(connect(self.config["db"])) as conn:
            result = record_heartbeat(conn, install_hash, beat, now_iso())
        self.send_json(200, {"success": True, "data": result})

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def build_config(db_path, secret, salt, host, port):
    return {
        "db": db_path,
        "secret": secret,
        "salt": salt,
        "host": host,
        "port": port,
        "limiter": RateLimiter(DAILY_UPLOAD_LIMIT),
        "ip_limiter": RateLimiter(DAILY_IP_UPLOAD_LIMIT),
        "heartbeat_limiter": RateLimiter(DAILY_IP_HEARTBEAT_LIMIT),
        "sessions": SessionStore(salt),
        "session_limiter": RateLimiter(SESSION_ISSUE_LIMIT_PER_IP),
    }


def load_config():
    db_path = os.environ.get("RANKPEEK_INGEST_DB", "/srv/rankpeek/db/hextech.db")
    secret = os.environ.get("RANKPEEK_INGEST_PROXY_SECRET", "").strip()
    salt_file = os.environ.get("RANKPEEK_INGEST_SALT_FILE", "/etc/rankpeek/ingest.salt")
    salt = os.environ.get("RANKPEEK_INGEST_SALT", "").strip()
    if not salt and os.path.exists(salt_file):
        with open(salt_file, "r", encoding="utf-8") as handle:
            salt = handle.read().strip()
    if not salt:
        raise SystemExit("RANKPEEK_INGEST_SALT or RANKPEEK_INGEST_SALT_FILE is required")
    return build_config(
        db_path,
        secret,
        salt,
        os.environ.get("RANKPEEK_INGEST_HOST", "127.0.0.1"),
        int(os.environ.get("RANKPEEK_INGEST_PORT", "8787")),
    )


def main():
    config = load_config()
    init_db(config["db"])
    server = IngestServer((config["host"], config["port"]), IngestHandler, config)
    sys.stderr.write("[%s] listening on %s:%d db=%s secret=%s\n" % (
        now_iso(), config["host"], config["port"], config["db"],
        "set" if config["secret"] else "loopback-only"))
    sys.stderr.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
