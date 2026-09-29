package io.rankpeek.event;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.Getter;
import org.springframework.context.ApplicationEvent;

/**
 * 选人阶段更新事件
 * 当 LCU 选人会话数据更新时发布
 */
@Getter
public class ChampionSelectUpdatedEvent extends ApplicationEvent {

    private final JsonNode sessionData;

    public ChampionSelectUpdatedEvent(Object source, JsonNode sessionData) {
        super(source);
        this.sessionData = sessionData;
    }
}
