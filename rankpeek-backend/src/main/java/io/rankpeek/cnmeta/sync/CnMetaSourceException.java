package io.rankpeek.cnmeta.sync;

public class CnMetaSourceException extends RuntimeException {
    private final Integer httpStatus;
    private final boolean stopSignal;

    public CnMetaSourceException(String message) {
        this(message, null, false, null);
    }

    public CnMetaSourceException(String message, Integer httpStatus) {
        this(message, httpStatus, false, null);
    }

    public CnMetaSourceException(String message, Throwable cause) {
        this(message, null, false, cause);
    }

    private CnMetaSourceException(String message, Integer httpStatus, boolean stopSignal, Throwable cause) {
        super(message, cause);
        this.httpStatus = httpStatus;
        this.stopSignal = stopSignal;
    }

    public static CnMetaSourceException stopSignal(String message) {
        return new CnMetaSourceException(message, null, true, null);
    }

    public Integer httpStatus() {
        return httpStatus;
    }

    public boolean stopSignal() {
        return stopSignal;
    }
}
