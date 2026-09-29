package io.rankpeek.exception;

import lombok.Getter;

/**
 * 参数校验异常
 * 当请求参数验证失败时抛出
 */
@Getter
public class ValidationException extends BaseException {

    private static final int DEFAULT_ERROR_CODE = 400;

    private final String field;

    public ValidationException(String message) {
        super(message, DEFAULT_ERROR_CODE);
        this.field = null;
    }

    public ValidationException(String field, String message) {
        super(String.format("字段 [%s] 验证失败：%s", field, message), DEFAULT_ERROR_CODE);
        this.field = field;
    }

    public ValidationException(String field, String message, String detail) {
        super(String.format("字段 [%s] 验证失败：%s", field, message), DEFAULT_ERROR_CODE, detail);
        this.field = field;
    }
}
