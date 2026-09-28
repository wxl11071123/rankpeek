package io.rankpeek.service;

import io.rankpeek.cache.MatchHistoryCacheRepository;
import io.rankpeek.exception.LcuException;
import io.rankpeek.exception.ResourceNotFoundException;
import io.rankpeek.model.Summoner;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Optional;
import java.util.concurrent.TimeUnit;

/**
 * 召唤师数据服务
 * 提供召唤师信息查询功能
 */
@Slf4j
@Service
public class SummonerService {

    private final LcuHttpClient lcuHttpClient;
    private final MatchHistoryCacheRepository cacheRepository;

    private Cache<String, Summoner> summonerCache;

    @Autowired
    public SummonerService(LcuHttpClient lcuHttpClient,
                           ObjectProvider<MatchHistoryCacheRepository> cacheRepositoryProvider) {
        this(lcuHttpClient, cacheRepositoryProvider.getIfAvailable());
    }

    public SummonerService(LcuHttpClient lcuHttpClient) {
        this(lcuHttpClient, (MatchHistoryCacheRepository) null);
    }

    public SummonerService(LcuHttpClient lcuHttpClient, MatchHistoryCacheRepository cacheRepository) {
        this.lcuHttpClient = lcuHttpClient;
        this.cacheRepository = cacheRepository;
    }

    @PostConstruct
    public void init() {
        this.summonerCache = Caffeine.newBuilder()
                .maximumSize(500)
                .expireAfterWrite(10, TimeUnit.MINUTES)
                .build();
        log.info("召唤师服务初始化完成");
    }

    /**
     * 获取当前登录的召唤师信息
     */
    public Summoner getMySummoner() {
        try {
            Summoner summoner = lcuHttpClient.get("lol-summoner/v1/current-summoner", Summoner.class);
            if (summoner != null && summoner.getPuuid() != null) {
                summonerCache.put(summoner.getPuuid(), summoner);
                saveSummonerToLocalCache(summoner);
            }
            return summoner;
        } catch (Exception e) {
            throw new LcuException("获取当前召唤师信息失败", e);
        }
    }

    /**
     * 根据 PUUID 获取召唤师信息
     */
    public Summoner getSummonerByPuuid(String puuid) {
        Summoner memorySummoner = summonerCache.getIfPresent(puuid);
        if (memorySummoner != null) {
            return memorySummoner;
        }

        Optional<Summoner> databaseSummoner = findCachedSummonerByPuuid(puuid);
        if (databaseSummoner.isPresent()) {
            summonerCache.put(puuid, databaseSummoner.get());
            return databaseSummoner.get();
        }

        try {
            return summonerCache.get(puuid, key -> {
                String uri = String.format("lol-summoner/v2/summoners/puuid/%s", puuid);
                Summoner summoner = lcuHttpClient.get(uri, Summoner.class);
                if (summoner == null) {
                    throw new ResourceNotFoundException("召唤师", puuid);
                }
                saveSummonerToLocalCache(summoner);
                return summoner;
            });
        } catch (ResourceNotFoundException e) {
            throw e;
        } catch (Exception e) {
            Optional<Summoner> fallback = findCachedSummonerByPuuid(puuid);
            if (fallback.isPresent()) {
                summonerCache.put(puuid, fallback.get());
                return fallback.get();
            }
            throw new LcuException("获取召唤师信息失败：" + puuid, e);
        }
    }

    /**
     * 根据名称获取召唤师信息
     */
    public Summoner getSummonerByName(String name) {
        Summoner memorySummoner = summonerCache.getIfPresent(name);
        if (memorySummoner != null) {
            return memorySummoner;
        }

        ParsedSummonerName parsedName = parseSummonerName(name);
        Optional<Summoner> databaseSummoner = findCachedSummonerByName(parsedName);
        if (databaseSummoner.isPresent()) {
            cacheSummonerAliases(name, databaseSummoner.get());
            return databaseSummoner.get();
        }

        try {
            return summonerCache.get(name, key -> {
                String encodedName = java.net.URLEncoder.encode(key, java.nio.charset.StandardCharsets.UTF_8);
                String uri = String.format("lol-summoner/v1/summoners/?name=%s", encodedName);
                Summoner summoner = lcuHttpClient.get(uri, Summoner.class);
                if (summoner != null) {
                    if (summoner.getPuuid() != null) {
                        summonerCache.put(summoner.getPuuid(), summoner);
                    }
                    saveSummonerToLocalCache(summoner);
                }
                if (summoner == null) {
                    throw new ResourceNotFoundException("召唤师", name);
                }
                return summoner;
            });
        } catch (ResourceNotFoundException e) {
            throw e;
        } catch (Exception e) {
            Optional<Summoner> fallback = findCachedSummonerByName(parsedName);
            if (fallback.isPresent()) {
                cacheSummonerAliases(name, fallback.get());
                return fallback.get();
            }
            throw new LcuException("获取召唤师信息失败：" + name, e);
        }
    }

    /**
     * Local cache helpers.
     */
    private Optional<Summoner> findCachedSummonerByPuuid(String puuid) {
        if (cacheRepository == null) {
            return Optional.empty();
        }
        return cacheRepository.findSummonerByPuuid(puuid);
    }

    private Optional<Summoner> findCachedSummonerByName(ParsedSummonerName name) {
        if (cacheRepository == null) {
            return Optional.empty();
        }
        return cacheRepository.findSummonerByName(name.gameName(), name.tagLine());
    }

    private void saveSummonerToLocalCache(Summoner summoner) {
        if (cacheRepository != null) {
            cacheRepository.saveSummoner(summoner);
        }
    }

    private void cacheSummonerAliases(String requestedName, Summoner summoner) {
        summonerCache.put(requestedName, summoner);
        if (summoner.getPuuid() != null) {
            summonerCache.put(summoner.getPuuid(), summoner);
        }
    }

    private ParsedSummonerName parseSummonerName(String name) {
        if (name == null) {
            return new ParsedSummonerName("", null);
        }
        String trimmed = name.trim();
        int separator = trimmed.lastIndexOf('#');
        if (separator > 0 && separator < trimmed.length() - 1) {
            return new ParsedSummonerName(trimmed.substring(0, separator), trimmed.substring(separator + 1));
        }
        return new ParsedSummonerName(trimmed, null);
    }

    private record ParsedSummonerName(String gameName, String tagLine) {
    }

    /**
     * 获取服务器名称
     * @param name 召唤师名称
     * @return 服务器中文名
     */
    public String getPlatformName(String name) {
        Summoner summoner = getSummonerByName(name);
        if (summoner == null || summoner.getPuuid() == null) {
            return "暂无";
        }
        
        String puuid = summoner.getPuuid();
        if (puuid.startsWith("WAL-")) {
            return "外网";
        } else if (puuid.startsWith("CN")) {
            int serverCode = Integer.parseInt(puuid.substring(2, 4));
            return switch (serverCode) {
                case 1 -> "艾欧尼亚";
                case 2 -> "诺克萨斯";
                case 3 -> "均衡教派";
                case 4 -> "暗影岛";
                case 5 -> "德玛西亚";
                case 6 -> "弗雷尔卓德";
                case 7 -> "祖安";
                case 8 -> "皮尔特沃夫";
                case 9 -> "战争学院";
                case 10 -> "卡拉曼达";
                case 11 -> "水晶之痕";
                case 12 -> "扭曲丛林";
                case 13 -> "钢铁烈阳";
                case 14 -> "巨神峰";
                case 15 -> "征服之海";
                case 16 -> "影流";
                case 17 -> "守望之海";
                case 18 -> "黑色切割者";
                case 19 -> "雷瑟守备";
                case 20 -> " Judgment";
                case 21 -> "班德尔城";
                case 22 -> "网络一区";
                case 23 -> "网络二区";
                case 24 -> "网络三区";
                case 25 -> "教育专区";
                case 26 -> "男爵领域";
                case 27 -> "峡谷之巅";
                default -> "未知";
            };
        }
        return "未知";
    }

    /**
     * 刷新指定召唤师缓存
     */
    public void refreshCache(String puuid) {
        summonerCache.invalidate(puuid);
    }

    /**
     * 刷新所有缓存
     */
    public void refreshAllCache() {
        summonerCache.invalidateAll();
    }
}
