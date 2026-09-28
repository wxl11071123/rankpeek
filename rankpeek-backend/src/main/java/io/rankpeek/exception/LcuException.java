package io.rankpeek.exception;

/**
 * LCU 异常
 * 当 LCU 连接或请求失败时抛出
 */
public class LcuException extends BaseException {

    private static final int DEFAULT_ERROR_CODE = 503;

    public LcuException(String message) {
        super(message, DEFAULT_ERROR_CODE);
    }

    public LcuException(String message, Throwable cause) {
        super(message, DEFAULT_ERROR_CODE, cause);
    }

    public LcuException(String message, int errorCode) {
        super(message, errorCode);
    }
}
