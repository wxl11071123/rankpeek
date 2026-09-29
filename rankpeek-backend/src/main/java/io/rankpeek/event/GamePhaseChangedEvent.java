package io.rankpeek.event;

import lombok.Getter;
import org.springframework.context.ApplicationEvent;

/**
 * 游戏阶段变化事件
 * 当 LCU 游戏阶段发生变化时发布
 */
@Getter
public class GamePhaseChangedEvent extends ApplicationEvent {

    private final String oldPhase;
    private final String newPhase;

    public GamePhaseChangedEvent(Object source, String oldPhase, String newPhase) {
        super(source);
        this.oldPhase = oldPhase;
        this.newPhase = newPhase;
    }
}
