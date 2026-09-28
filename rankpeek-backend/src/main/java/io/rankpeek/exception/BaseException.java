package io.rankpeek.exception;

import lombok.Getter;

/**
 * 基础异常类
 * 所有自定义异常的父类
 */
@Getter
public abstract class BaseException extends RuntimeException {

    /**
     * 错误码
     */
    private final int errorCode;

    /**
     * 错误详情
     */
    private final String detail;

    protected BaseException(String message, int errorCode) {
        super(message);
        this.errorCode = errorCode;
        this.detail = null;
    }

    protected BaseException(String message, int errorCode, String detail) {
        super(message);
        this.errorCode = errorCode;
        this.detail = detail;
    }

    protected BaseException(String message, int errorCode, Throwable cause) {
        super(message, cause);
        this.errorCode = errorCode;
        this.detail = null;
    }
}
