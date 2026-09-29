package io.rankpeek.opgg;

public class OpggSourceException extends RuntimeException {
    public OpggSourceException(String message) {
        super(message);
    }

    public OpggSourceException(String message, Throwable cause) {
        super(message, cause);
    }
}
