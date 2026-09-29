package io.rankpeek.cnmeta.sync;

import java.util.List;

import org.springframework.stereotype.Component;

@Component
public class RealCnMetaSourceParser {
    public List<CnMetaChampionStatRow> parseRows(String rawContent, String tierScope, String role) {
        throw new CnMetaSourceException("Real CN meta parser is not configured for local sync yet");
    }
}
