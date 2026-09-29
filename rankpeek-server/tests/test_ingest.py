#!/usr/bin/env python3
"""接收服务 + 聚合脚本的本地端到端测试（标准库，无外部依赖）。

    python -m unittest discover -s rankpeek-server/tests -v
"""
import hashlib
import json
import os
import sqlite3
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from contextlib import closing
from datetime import timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "service"))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import hextech_ingest  # noqa: E402
import aggregate_hextech  # noqa: E402

SECRET = "test-proxy-secret"
SALT = "test-salt"
DEFAULT_INSTALL_ID = "rp-11111111-2222-3333-4444-555555555555"


def make_game(game_key, players, patch="16.19", queue_id=2400, duration=None):
    # 默认不带 durationSec：新客户端已经不再上传它（聚合用不到）
    game = {
        "gameKey": game_key,
        "patch": patch,
        "queueId": queue_id,
        "playedAt": 1758700000000,
        "players": players,
    }
    if duration is not None:
        game["durationSec"] = duration
    return game


def make_player(champion_id, augment_ids, win):
    return {"championId": champion_id, "augmentIds": augment_ids, "win": win}


def game_key(seed):
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()


class IngestServiceTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmpdir = tempfile.mkdtemp(prefix="rankpeek-ingest-")
        cls.db_path = os.path.join(cls.tmpdir, "hextech.db")
        hextech_ingest.init_db(cls.db_path)
        config = hextech_ingest.build_config(cls.db_path, SECRET, SALT, "127.0.0.1", 0)
        cls.server = hextech_ingest.IngestServer(("127.0.0.1", 0), hextech_ingest.IngestHandler, config)
        cls.base = "http://127.0.0.1:%d" % cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def post(self, path, payload, secret=SECRET, raw=None, token=None):
        body = raw if raw is not None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(self.base + path, data=body, method="POST")
        request.add_header("Content-Type", "application/json")
        if secret is not None:
            request.add_header("X-RankPeek-Proxy", secret)
        if token:
            request.add_header("Authorization", "Bearer " + token)
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read().decode("utf-8"))

    def get(self, path):
        with urllib.request.urlopen(self.base + path, timeout=10) as response:
            return response.status, json.loads(response.read().decode("utf-8"))

    def open_session(self, install_id=DEFAULT_INSTALL_ID):
        status, body = self.post("/api/v1/upload/session", {
            "schemaVersion": 1, "installId": install_id,
            "appVersion": "1.0.4", "platform": "win32"})
        self.assertEqual(status, 200, body)
        return body["data"]["token"]

    def upload(self, payload, install_id=DEFAULT_INSTALL_ID):
        """正常上传：先换一个短期会话，再带 Bearer 上传。"""
        return self.post("/api/v1/upload/batch", payload,
                         token=self.open_session(install_id))

    def test_01_health(self):
        status, payload = self.get("/health")
        self.assertEqual(status, 200)
        self.assertTrue(payload["success"])

    def test_02_requires_proxy_secret(self):
        status, payload = self.post("/api/v1/upload/batch", {"schemaVersion": 1}, secret=None)
        self.assertEqual(status, 401)
        self.assertEqual(payload["error"]["code"], "unauthorized")

    def test_03_rejects_unknown_and_forbidden_fields(self):
        base = {
            "schemaVersion": 1,
            "installId": "rp-11111111-2222-3333-4444-555555555555",
            "appVersion": "1.0.3",
            "platform": "win32",
            "games": [make_game(game_key("a"), [make_player(875, [1001], True)])],
        }
        status, payload = self.upload(dict(base, extra=1))
        self.assertEqual(status, 400)
        self.assertIn("unknown field", payload["error"]["message"])

        game = base["games"][0]
        game["players"][0]["puuid"] = "leaked"
        status, payload = self.upload(base)
        self.assertEqual(status, 400)
        self.assertIn("not allowed", payload["error"]["message"])

    def test_03b_duration_still_validated_when_present(self):
        # 新客户端不再上传 durationSec（聚合用不到），但老客户端传了就必须合法
        payload = {
            "schemaVersion": 1,
            "installId": "rp-11111111-2222-3333-4444-555555555555",
            "games": [make_game(game_key("bad-duration"), [make_player(875, [1001], True)], duration=99999)],
        }
        status, body = self.upload(payload)
        self.assertEqual(status, 400)
        self.assertIn("durationSec", body["error"]["message"])

    def test_04_rejects_non_hextech_queue(self):
        payload = {
            "schemaVersion": 1,
            "installId": "rp-11111111-2222-3333-4444-555555555555",
            "games": [make_game(game_key("b"), [make_player(875, [1001], True)], queue_id=420)],
        }
        status, body = self.upload(payload)
        self.assertEqual(status, 400)
        self.assertIn("queueId", body["error"]["message"])

    def test_05_rejects_oversized_and_malformed_body(self):
        status, _ = self.post("/api/v1/upload/batch", None, raw=b"x" * (hextech_ingest.MAX_BODY_BYTES + 1), token=self.open_session())
        self.assertEqual(status, 400)
        status, _ = self.post("/api/v1/upload/batch", None, raw=b"{not json", token=self.open_session())
        self.assertEqual(status, 400)

    def test_06_accepts_batch_and_counts(self):
        payload = {
            "schemaVersion": 1,
            "installId": "rp-11111111-2222-3333-4444-555555555555",
            "appVersion": "1.0.3",
            "platform": "win32",
            "games": [
                make_game(game_key("g1"), [
                    make_player(875, [1001, 1002], True),
                    make_player(1, [1001], False),
                ]),
                make_game(game_key("g2"), [
                    make_player(875, [1001, 1003], True),
                ]),
            ],
        }
        status, body = self.upload(payload)
        self.assertEqual(status, 200)
        self.assertEqual(body["data"]["accepted"], 2)
        self.assertEqual(body["data"]["duplicates"], 0)
        self.assertEqual(body["data"]["playersCounted"], 3)
        self.assertEqual(body["data"]["counterRows"], 5)

        with sqlite3.connect(self.db_path) as conn:
            rows = dict(
                ((champion, augment), (wins, games))
                for champion, augment, wins, games in conn.execute(
                    "SELECT champion_id, augment_id, SUM(wins), SUM(games) FROM actor_cell"
                    " GROUP BY champion_id, augment_id")
            )
        self.assertEqual(rows[(875, 1001)], (2, 2))
        self.assertEqual(rows[(875, 1002)], (1, 1))
        self.assertEqual(rows[(1, 1001)], (0, 1))

    def test_07_duplicate_game_is_ignored(self):
        payload = {
            "schemaVersion": 1,
            "installId": "rp-11111111-2222-3333-4444-555555555555",
            "games": [make_game(game_key("g1"), [make_player(875, [1001, 1002], True)])],
        }
        status, body = self.upload(payload)
        self.assertEqual(status, 200)
        self.assertEqual(body["data"]["accepted"], 0)
        self.assertEqual(body["data"]["duplicates"], 1)

    def test_08_heartbeat_dedupes_per_day(self):
        payload = {
            "installId": "rp-11111111-2222-3333-4444-555555555555",
            "day": "2026-09-25",
            "version": "1.0.3",
            "patch": "16.19",
            "mode": "hextech",
            "os": "win32",
        }
        status, body = self.post("/api/v1/telemetry/heartbeat", payload)
        self.assertEqual(status, 200)
        self.assertTrue(body["data"]["recorded"])
        status, body = self.post("/api/v1/telemetry/heartbeat", payload)
        self.assertEqual(status, 200)
        self.assertFalse(body["data"]["recorded"])

    def test_09_install_id_never_stored_plaintext(self):
        with sqlite3.connect(self.db_path) as conn:
            hashes = [row[0] for row in conn.execute("SELECT DISTINCT install_hash FROM uploaded_games")]
        self.assertTrue(hashes)
        for value in hashes:
            self.assertNotIn("rp-1111", value)
            self.assertEqual(len(value), 64)

    def test_10_aggregate_publishes_versioned_assets(self):
        out_root = os.path.join(self.tmpdir, "data")
        payload = aggregate_hextech.publish(self.db_path, out_root, min_sample=2, keep=3)
        version_dir = os.path.join(out_root, "hextech", payload["dataVersion"])
        self.assertTrue(os.path.isfile(os.path.join(version_dir, "matrix.json")))
        self.assertTrue(os.path.isfile(os.path.join(version_dir, "matrix.json.gz")))
        self.assertTrue(os.path.isfile(os.path.join(out_root, "hextech", "version.json")))
        # latest 软链只是方便调试；Windows 非管理员建不了符号链接，不作为契约
        with open(os.path.join(out_root, "hextech", "version.json"), "rb") as handle:
            pointer = json.loads(handle.read().decode("utf-8"))
        self.assertEqual(pointer["dataVersion"], payload["dataVersion"])

        with open(os.path.join(version_dir, "matrix.json"), "rb") as handle:
            matrix = json.loads(handle.read().decode("utf-8"))
        self.assertEqual(matrix["patch"], "16.19")
        self.assertEqual(matrix["totalGames"], 2)
        champions = {entry["championId"]: entry["augments"] for entry in matrix["champions"]}
        self.assertEqual(champions[875][0]["id"], 1001)
        self.assertEqual(champions[875][0]["games"], 2)
        # 只有一个 install 贡献过：样本不足 + 单人占比 100%，都不该被当成可信排名
        self.assertEqual(champions[875][0]["actorCount"], 1)
        self.assertTrue(champions[875][0]["lowSample"])
        self.assertTrue(champions[875][0]["suppressed"])

        # 内容不变 -> 版本号不变（幂等）
        again = aggregate_hextech.publish(self.db_path, out_root, min_sample=2, keep=3)
        self.assertEqual(again["dataVersion"], payload["dataVersion"])


class DirectModeTest(unittest.TestCase):
    """未配置共享密钥（客户端直连）时：允许写入，但按来源 IP 限流。"""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp(prefix="rankpeek-direct-")
        self.db_path = os.path.join(self.tmpdir, "hextech.db")
        hextech_ingest.init_db(self.db_path)
        config = hextech_ingest.build_config(self.db_path, "", SALT, "127.0.0.1", 0)
        config["ip_limiter"] = hextech_ingest.RateLimiter(2)
        self.server = hextech_ingest.IngestServer(("127.0.0.1", 0), hextech_ingest.IngestHandler, config)
        self.base = "http://127.0.0.1:%d" % self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()

    def post(self, path, payload, token=None):
        request = urllib.request.Request(
            self.base + path, data=json.dumps(payload).encode("utf-8"), method="POST")
        request.add_header("Content-Type", "application/json")
        if token:
            request.add_header("Authorization", "Bearer " + token)
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read().decode("utf-8"))

    def open_session(self, install_id):
        status, body = self.post("/api/v1/upload/session", {
            "schemaVersion": 1, "installId": install_id, "appVersion": "1.0.4"})
        self.assertEqual(status, 200, body)
        return body["data"]["token"]

    def upload(self, payload):
        return self.post("/api/v1/upload/batch", payload,
                         token=self.open_session(payload["installId"]))

    def test_direct_mode_allows_then_rate_limits_by_ip(self):
        payload = {
            "schemaVersion": 1,
            "installId": "rp-99999999-8888-7777-6666-555555555555",
            "games": [make_game(game_key("d1"), [make_player(875, [1001], True)])],
        }
        status, body = self.upload(payload)
        self.assertEqual(status, 200)
        self.assertEqual(body["data"]["accepted"], 1)

        payload["games"] = [make_game(game_key("d2"), [make_player(875, [1002], True)])]
        status, _ = self.upload(payload)
        self.assertEqual(status, 200)

        payload["games"] = [make_game(game_key("d3"), [make_player(875, [1003], True)])]
        status, body = self.upload(payload)
        self.assertEqual(status, 429)
        self.assertEqual(body["error"]["code"], "rate_limited_ip")


class GameKeyRetentionTest(unittest.TestCase):
    """去重记录只留 48 小时 —— 这是对玩家明说的（贡献弹窗示例里写着「服务器只留 48 小时」）。"""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp(prefix="rankpeek-retention-")
        self.db_path = os.path.join(self.tmpdir, "hextech.db")
        hextech_ingest.init_db(self.db_path)
        hextech_ingest._last_purge_at = 0.0

    def count_games(self):
        conn = sqlite3.connect(self.db_path)
        try:
            return conn.execute("SELECT COUNT(*) FROM uploaded_games").fetchone()[0]
        finally:
            conn.close()

    def insert_game(self, key, created_at):
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                "INSERT INTO uploaded_games"
                " (game_key, patch, queue_id, duration_sec, played_at, install_hash, created_at)"
                " VALUES (?, '16.19', 2400, 0, 0, 'install', ?)",
                (key, created_at))
            conn.commit()
        finally:
            conn.close()

    def test_purge_removes_records_older_than_48_hours(self):
        old = (hextech_ingest.datetime.now(hextech_ingest.CN_TZ)
               - timedelta(hours=49)).isoformat(timespec="seconds")
        fresh = (hextech_ingest.datetime.now(hextech_ingest.CN_TZ)
                 - timedelta(hours=1)).isoformat(timespec="seconds")
        self.insert_game(game_key("old"), old)
        self.insert_game(game_key("fresh"), fresh)
        self.assertEqual(self.count_games(), 2)

        conn = hextech_ingest.connect(self.db_path)
        try:
            removed = hextech_ingest.purge_expired_games(conn, force=True)
            conn.commit()
        finally:
            conn.close()

        self.assertEqual(removed, 1)
        self.assertEqual(self.count_games(), 1)

    def test_purge_keeps_recent_records_so_dedupe_still_works(self):
        """48 小时内的重复上传必须继续被识别为重复，否则同一局会被重复计数。"""
        key = game_key("dupe")
        payload = {
            "schemaVersion": 1,
            "installId": "rp-99999999-8888-7777-6666-555555555555",
            "games": [make_game(key, [make_player(875, [1001], True)])],
        }
        _, games = hextech_ingest.validate_batch(payload)
        conn = hextech_ingest.connect(self.db_path)
        try:
            first = hextech_ingest.ingest_batch(conn, games, "install", hextech_ingest.now_iso())
            second = hextech_ingest.ingest_batch(conn, games, "install", hextech_ingest.now_iso())
        finally:
            conn.close()

        self.assertEqual(first["accepted"], 1)
        self.assertEqual(second["accepted"], 0)
        self.assertEqual(second["duplicates"], 1)


class SessionPolicyTest(unittest.TestCase):
    """短期上传会话：客户端必须先换 token 才能上传，token 有额度、会过期。"""

    def test_batch_without_or_with_bogus_token_is_rejected(self):
        tmpdir = tempfile.mkdtemp(prefix="rankpeek-session-")
        db_path = os.path.join(tmpdir, "hextech.db")
        hextech_ingest.init_db(db_path)
        config = hextech_ingest.build_config(db_path, "", SALT, "127.0.0.1", 0)
        server = hextech_ingest.IngestServer(("127.0.0.1", 0), hextech_ingest.IngestHandler, config)
        base = "http://127.0.0.1:%d" % server.server_address[1]
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            payload = {"schemaVersion": 1,
                       "games": [make_game(game_key("no-token"), [make_player(875, [1001], True)])]}
            for token in (None, "not-a-real-token"):
                request = urllib.request.Request(
                    base + "/api/v1/upload/batch",
                    data=json.dumps(payload).encode("utf-8"), method="POST")
                request.add_header("Content-Type", "application/json")
                if token:
                    request.add_header("Authorization", "Bearer " + token)
                try:
                    with urllib.request.urlopen(request, timeout=10) as response:
                        status, body = response.status, json.loads(response.read().decode("utf-8"))
                except urllib.error.HTTPError as error:
                    status, body = error.code, json.loads(error.read().decode("utf-8"))
                self.assertEqual(status, 401)
                self.assertEqual(body["error"]["code"], "invalid_session")
        finally:
            server.shutdown()
            server.server_close()

    def test_session_batch_quota_is_enforced(self):
        store = hextech_ingest.SessionStore("salt", ttl_seconds=60, batch_limit=2)
        token, _ = store.issue("install-a")
        self.assertIsNotNone(store.resolve(token))
        self.assertIsNotNone(store.resolve(token))
        self.assertIsNone(store.resolve(token), "批次额度用完后会话必须失效")

    def test_expired_session_is_rejected(self):
        store = hextech_ingest.SessionStore("salt", ttl_seconds=10)
        token, _ = store.issue("install-a", now=1000.0)
        self.assertIsNone(store.resolve(token, now=2000.0))

    def test_batch_reports_per_game_acknowledgements(self):
        tmpdir = tempfile.mkdtemp(prefix="rankpeek-ack-")
        db_path = os.path.join(tmpdir, "hextech.db")
        hextech_ingest.init_db(db_path)
        config = hextech_ingest.build_config(db_path, "", SALT, "127.0.0.1", 0)
        server = hextech_ingest.IngestServer(("127.0.0.1", 0), hextech_ingest.IngestHandler, config)
        base = "http://127.0.0.1:%d" % server.server_address[1]
        threading.Thread(target=server.serve_forever, daemon=True).start()

        def call(path, payload, token=None):
            request = urllib.request.Request(
                base + path, data=json.dumps(payload).encode("utf-8"), method="POST")
            request.add_header("Content-Type", "application/json")
            if token:
                request.add_header("Authorization", "Bearer " + token)
            try:
                with urllib.request.urlopen(request, timeout=10) as response:
                    return response.status, json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as error:
                return error.code, json.loads(error.read().decode("utf-8"))

        try:
            status, body = call("/api/v1/upload/session", {
                "schemaVersion": 1, "installId": DEFAULT_INSTALL_ID, "appVersion": "1.0.4"})
            self.assertEqual(status, 200, body)
            token = body["data"]["token"]
            self.assertEqual(body["data"]["maxBatchSize"], hextech_ingest.MAX_GAMES_PER_BATCH)

            # 同一批里放两条一模一样的对局：第一条 inserted，第二条 duplicate，互不影响
            same = make_game(game_key("ack-1"), [make_player(875, [1001], True)])
            status, body = call("/api/v1/upload/batch", {"schemaVersion": 1, "games": [same, same]}, token)
            self.assertEqual(status, 200, body)
            acks = body["data"]["acknowledgements"]
            self.assertEqual([ack["status"] for ack in acks], ["inserted", "duplicate"])
            self.assertEqual(body["data"]["accepted"], 1)
            self.assertEqual(body["data"]["duplicates"], 1)
        finally:
            server.shutdown()
            server.server_close()


class AntiPoisoningTest(unittest.TestCase):
    """matrix 必须是 actor_cell 的派生结果：能截断、能删人重算、小样本不会被吹成版本答案。"""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp(prefix="rankpeek-anti-")
        self.db_path = os.path.join(self.tmpdir, "hextech.db")
        hextech_ingest.init_db(self.db_path)

    def add_cell(self, install, champion, augment, wins, games,
                 patch="16.19", version="1.0.4"):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO actor_cell"
                " (patch, champion_id, augment_id, install_hash, client_version,"
                "  wins, games, updated_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (patch, champion, augment, install, version, wins, games,
                 hextech_ingest.now_iso()))

    def matrix(self, **kwargs):
        with closing(aggregate_hextech.connect(self.db_path)) as conn:
            return aggregate_hextech.build_matrix(conn, "16.19", kwargs.pop("min_sample", 2), **kwargs)

    def cell(self, matrix, champion, augment):
        for entry in matrix["champions"]:
            if entry["championId"] != champion:
                continue
            for row in entry["augments"]:
                if row["id"] == augment:
                    return row
        raise AssertionError("cell %s/%s not found" % (champion, augment))

    def test_single_install_cannot_dominate_a_cell(self):
        # 一个 install 灌 100 场全胜
        self.add_cell("attacker", 875, 1001, 100, 100)
        row = self.cell(self.matrix(actor_cap=3), 875, 1001)
        self.assertEqual(row["games"], 3, "截断后最多算 3 个有效样本")
        self.assertEqual(row["rawGames"], 100, "原始计数仍然如实记录，只是不参与排名")
        self.assertTrue(row["suppressed"])

    def test_deleting_an_actor_changes_the_published_matrix(self):
        """回滚能力：删掉某个 install 的行，重算就是干净的。"""
        self.add_cell("good-1", 875, 1001, 2, 3)
        self.add_cell("good-2", 875, 1001, 1, 3)
        self.add_cell("bad", 875, 1001, 9, 10)
        before = self.cell(self.matrix(actor_cap=3), 875, 1001)
        self.assertEqual(before["actorCount"], 3)

        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM actor_cell WHERE install_hash = 'bad'")

        after = self.cell(self.matrix(actor_cap=3), 875, 1001)
        self.assertEqual(after["actorCount"], 2)
        self.assertLess(after["games"], before["games"])

    def test_deleting_a_bad_client_version_changes_the_matrix(self):
        self.add_cell("a", 875, 1001, 3, 3, version="1.0.4")
        self.add_cell("b", 875, 1001, 3, 3, version="1.0.5-buggy")
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM actor_cell WHERE client_version = '1.0.5-buggy'")
        row = self.cell(self.matrix(actor_cap=3), 875, 1001)
        self.assertEqual(row["actorCount"], 1)
        self.assertEqual(row["games"], 3)

    def test_shrinkage_pulls_small_samples_toward_the_champion_average(self):
        # 该英雄整体是 50% 上下，某个强化 6 胜 0 负 —— 收缩后不该还显示 100%
        self.add_cell("a", 875, 1001, 6, 6)
        self.add_cell("b", 875, 1002, 0, 6)
        row = self.cell(self.matrix(min_sample=1, min_actors=1, kappa=20), 875, 1001)
        self.assertLess(row["winRate"], 0.7)
        self.assertGreater(row["winRate"], 0.5)

    def test_version_is_stable_even_when_the_clock_moves(self):
        """回归：matrix 里带 generatedAt，如果把它算进版本指纹，挂上 cron 后客户端每半小时重下一次。"""
        out_root = os.path.join(self.tmpdir, "data")
        self.add_cell("a", 875, 1001, 3, 3)
        original = aggregate_hextech.now_iso
        try:
            aggregate_hextech.now_iso = lambda: "2026-09-27T10:00:00+08:00"
            first = aggregate_hextech.publish(self.db_path, out_root, min_sample=1, keep=3)
            aggregate_hextech.now_iso = lambda: "2026-09-27T10:30:00+08:00"
            second = aggregate_hextech.publish(self.db_path, out_root, min_sample=1, keep=3)
        finally:
            aggregate_hextech.now_iso = original
        self.assertEqual(first["dataVersion"], second["dataVersion"])

    def test_version_changes_when_the_data_changes(self):
        out_root = os.path.join(self.tmpdir, "data")
        self.add_cell("a", 875, 1001, 3, 3)
        first = aggregate_hextech.publish(self.db_path, out_root, min_sample=1, keep=3)
        self.add_cell("b", 875, 1001, 2, 2)
        second = aggregate_hextech.publish(self.db_path, out_root, min_sample=1, keep=3)
        self.assertNotEqual(first["dataVersion"], second["dataVersion"])

    def test_effective_actor_count_exposes_single_machine_data(self):
        self.add_cell("only-one", 875, 1001, 3, 3)
        row = self.cell(self.matrix(min_actors=1), 875, 1001)
        self.assertEqual(row["effectiveActors"], 1.0)
        self.assertEqual(row["maxActorShare"], 1.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
