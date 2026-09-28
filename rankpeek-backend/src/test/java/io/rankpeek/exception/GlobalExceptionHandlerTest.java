package io.rankpeek.exception;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;

import java.lang.reflect.Method;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerTest {

    @Test
    void clientAbortHasDedicatedNoContentHandler() {
        Method handler = Arrays.stream(GlobalExceptionHandler.class.getDeclaredMethods())
                .filter(method -> Arrays.asList(method.getParameterTypes()).contains(AsyncRequestNotUsableException.class))
                .findFirst()
                .orElse(null);

        assertThat(handler).isNotNull();
        assertThat(handler.getReturnType()).isEqualTo(Void.TYPE);
        assertThat(handler.getAnnotation(ExceptionHandler.class).value())
                .contains(AsyncRequestNotUsableException.class);
        assertThat(handler.getAnnotation(ResponseStatus.class).value())
                .isEqualTo(HttpStatus.NO_CONTENT);
    }
}
