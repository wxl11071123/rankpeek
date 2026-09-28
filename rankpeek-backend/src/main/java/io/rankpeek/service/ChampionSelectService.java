package io.rankpeek.service;

import io.rankpeek.model.ChampionSelectSession;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Map;

/**
 * 选人阶段管理服务
 * 提供英雄选择、禁用等功能
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ChampionSelectService {

    private final LcuHttpClient lcuHttpClient;

    @PostConstruct
    public void init() {
        log.info("选人阶段服务初始化完成");
    }

    /**
     * 获取选人会话
     */
    public ChampionSelectSession getChampionSelectSession() {
        return lcuHttpClient.get("lol-champ-select/v1/session", ChampionSelectSession.class);
    }

    /**
     * 选择英雄
     */
    public void pickChampion(int actionId, int championId, boolean completed) {
        Map<String, Object> body = Map.of(
                "championId", championId,
                "type", "pick",
                "completed", completed
        );
        String uri = String.format("lol-champ-select/v1/session/actions/%d", actionId);
        lcuHttpClient.patch(uri, body, Void.class);
        log.info("选择英雄：championId={}, completed={}", championId, completed);
    }

    /**
     * 禁用英雄
     */
    public void banChampion(int actionId, int championId, boolean completed) {
        Map<String, Object> body = Map.of(
                "championId", championId,
                "type", "ban",
                "completed", completed
        );
        String uri = String.format("lol-champ-select/v1/session/actions/%d", actionId);
        lcuHttpClient.patch(uri, body, Void.class);
        log.info("禁用英雄：championId={}, completed={}", championId, completed);
    }
}
