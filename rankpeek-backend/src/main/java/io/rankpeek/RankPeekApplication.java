package io.rankpeek;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.boot.context.event.ApplicationFailedEvent;
import org.springframework.boot.web.server.PortInUseException;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.net.BindException;

/**
 * RankPeek backend entry point.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableAsync
@EnableScheduling
public class RankPeekApplication {

    private static final Logger log = LoggerFactory.getLogger(RankPeekApplication.class);

    public static void main(String[] args) {
        SpringApplication application = new SpringApplication(RankPeekApplication.class);
        application.addListeners(event -> {
            if (event instanceof ApplicationFailedEvent failedEvent) {
                logStartupFailure(failedEvent.getException());
            }
        });
        application.run(args);
    }

    private static void logStartupFailure(Throwable error) {
        if (containsCause(error, PortInUseException.class) || containsCause(error, BindException.class)) {
            log.error("RankPeek backend failed to start because port 8080 is already in use. "
                    + "Another backend or packaged RankPeek instance may already be running.");
            return;
        }

        log.error("RankPeek backend failed to start: rootCause={}", rootCauseSummary(error), error);
    }

    private static boolean containsCause(Throwable error, Class<? extends Throwable> type) {
        for (Throwable current = error; current != null; current = current.getCause()) {
            if (type.isInstance(current)) {
                return true;
            }
        }
        return false;
    }

    private static String rootCauseSummary(Throwable error) {
        Throwable current = error;
        while (current.getCause() != null) {
            current = current.getCause();
        }
        String message = current.getMessage();
        if (message == null || message.isBlank()) {
            message = error.getMessage();
        }
        return current.getClass().getSimpleName() + ": " + message;
    }
}
