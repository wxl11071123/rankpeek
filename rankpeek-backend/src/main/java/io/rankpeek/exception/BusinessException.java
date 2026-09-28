package io.rankpeek.exception;

/**
 * 业务规则异常
 * 当业务规则验证失败时抛出
 */
public class BusinessException extends BaseException {

    private static final int DEFAULT_ERROR_CODE = 400;

    public BusinessException(String message) {
        super(message, DEFAULT_ERROR_CODE);
    }

    public BusinessException(String message, int errorCode) {
        super(message, errorCode);
    }

    public BusinessException(String message, Throwable cause) {
        super(message, DEFAULT_ERROR_CODE, cause);
    }
}
