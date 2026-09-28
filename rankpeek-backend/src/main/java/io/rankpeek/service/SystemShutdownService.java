package io.rankpeek.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.stereotype.Service;

import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
@Service
@RequiredArgsConstructor
public class SystemShutdownService {

    private final ConfigurableApplicationContext applicationContext;
    private final AtomicBoolean shutdownRequested = new AtomicBoolean(false);

    public boolean requestShutdown() {
        if (!shutdownRequested.compareAndSet(false, true)) {
            return false;
        }

        Thread shutdownThread = new Thread(() -> {
            try {
                Thread.sleep(250);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }

            log.info("RankPeek backend graceful shutdown requested");
            int exitCode = SpringApplication.exit(applicationContext, () -> 0);
            System.exit(exitCode);
        }, "rankpeek-graceful-shutdown");
        shutdownThread.setDaemon(false);
        shutdownThread.start();
        return true;
    }
}
