package io.rankpeek.event;

import io.rankpeek.model.Lobby;
import lombok.Getter;
import org.springframework.context.ApplicationEvent;

/**
 * 大厅更新事件
 * 当 LCU 大厅数据更新时发布
 */
@Getter
public class LobbyUpdatedEvent extends ApplicationEvent {

    private final Lobby lobby;

    public LobbyUpdatedEvent(Object source, Lobby lobby) {
        super(source);
        this.lobby = lobby;
    }
}
