package io.rankpeek.sgp;

import lombok.Getter;

@Getter
public class SgpApiException extends RuntimeException {

    private final int statusCode;
    private final String sgpServerId;

    public SgpApiException(String message, int statusCode, String sgpServerId) {
        super(message);
        this.statusCode = statusCode;
        this.sgpServerId = sgpServerId;
    }

    public SgpApiException(String message, int statusCode, String sgpServerId, Throwable cause) {
        super(message, cause);
        this.statusCode = statusCode;
        this.sgpServerId = sgpServerId;
    }
}
