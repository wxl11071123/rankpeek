package io.rankpeek.exception;

/**
 * 资源不存在异常
 * 当请求的资源（召唤师、对局等）不存在时抛出
 */
public class ResourceNotFoundException extends BaseException {

    private static final int DEFAULT_ERROR_CODE = 404;

    public ResourceNotFoundException(String resourceName) {
        super(String.format("%s 不存在", resourceName), DEFAULT_ERROR_CODE);
    }

    public ResourceNotFoundException(String resourceName, Object id) {
        super(String.format("%s 不存在：%s", resourceName, id), DEFAULT_ERROR_CODE);
    }

    public ResourceNotFoundException(String resourceName, Object id, String detail) {
        super(String.format("%s 不存在：%s", resourceName, id), DEFAULT_ERROR_CODE, detail);
    }
}
