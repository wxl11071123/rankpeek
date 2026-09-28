package io.rankpeek.exception;

import io.rankpeek.model.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;

import java.util.HashMap;
import java.util.Map;

/**
 * 全局异常处理器
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * 处理 LCU 异常
     */
    @ExceptionHandler(LcuException.class)
    @ResponseStatus(HttpStatus.SERVICE_UNAVAILABLE)
    public ApiResponse<Void> handleLcuException(LcuException e) {
        log.error("LCU 异常：{}", e.getMessage());
        return ApiResponse.error(e.getErrorCode(), "LCU Error: " + e.getMessage());
    }

    /**
     * 处理资源不存在异常
     */
    @ExceptionHandler(ResourceNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ApiResponse<Void> handleResourceNotFound(ResourceNotFoundException e) {
        log.warn("资源不存在：{}", e.getMessage());
        return ApiResponse.error(e.getErrorCode(), e.getMessage());
    }

    /**
     * 处理参数校验异常
     */
    @ExceptionHandler(ValidationException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiResponse<Map<String, String>> handleValidation(ValidationException e) {
        log.warn("参数校验失败：{}", e.getMessage());
        
        Map<String, String> errors = new HashMap<>();
        if (e.getField() != null) {
            errors.put(e.getField(), e.getMessage());
        } else {
            errors.put("error", e.getMessage());
        }
        
        return ApiResponse.<Map<String, String>>builder()
                .code(e.getErrorCode())
                .message("参数校验失败")
                .data(errors)
                .timestamp(System.currentTimeMillis())
                .build();
    }

    /**
     * 处理业务规则异常
     */
    @ExceptionHandler(BusinessException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiResponse<Void> handleBusiness(BusinessException e) {
        log.warn("业务规则异常：{}", e.getMessage());
        return ApiResponse.error(e.getErrorCode(), e.getMessage());
    }

    /**
     * 处理参数验证异常（Spring Validation）
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiResponse<Map<String, String>> handleValidationErrors(MethodArgumentNotValidException e) {
        log.warn("请求参数验证失败");
        
        Map<String, String> errors = new HashMap<>();
        e.getBindingResult().getFieldErrors().forEach(error -> {
            String fieldName = error.getField();
            String errorMessage = error.getDefaultMessage();
            
            if (errors.containsKey(fieldName)) {
                errors.merge(fieldName, errorMessage, (existing, newMsg) -> existing + "; " + newMsg);
            } else {
                errors.put(fieldName, errorMessage);
            }
        });
        
        return ApiResponse.<Map<String, String>>builder()
                .code(HttpStatus.BAD_REQUEST.value())
                .message("请求参数验证失败")
                .data(errors)
                .timestamp(System.currentTimeMillis())
                .build();
    }

    /**
     * 处理非法参数异常
     */
    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ApiResponse<Void> handleIllegalArgument(IllegalArgumentException e) {
        log.warn("非法参数：{}", e.getMessage());
        return ApiResponse.error(HttpStatus.BAD_REQUEST.value(), "非法参数：" + e.getMessage());
    }

    /**
     * 处理通用异常
     */
    @ExceptionHandler(AsyncRequestNotUsableException.class)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void handleClientAbort(AsyncRequestNotUsableException e) {
        log.debug("Client disconnected before response was written: {}", e.getMessage());
    }

    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ApiResponse<Void> handleException(Exception e) {
        if (e instanceof RuntimeException) {
            log.error("运行时异常：", e);
        } else {
            log.error("服务器内部错误：", e);
        }
        return ApiResponse.error(500, "服务器内部错误：" + e.getMessage());
    }
}
