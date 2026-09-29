package io.rankpeek.ai;

public class LocalAiConfigurationException extends RuntimeException {

    public static final String CODE = "AI_PROVIDER_NOT_CONFIGURED";

    public LocalAiConfigurationException(String message) {
        super(message);
    }
}
