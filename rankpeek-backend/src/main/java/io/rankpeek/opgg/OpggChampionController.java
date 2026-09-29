package io.rankpeek.opgg;

import io.rankpeek.model.ApiResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Locale;
import java.util.Set;

@RestController
@RequestMapping("/api/v1/opgg")
public class OpggChampionController {
    private static final String REGION_KR = "kr";
    private static final Set<String> MODES = Set.of("ranked", "aram", "arena", "nexus_blitz", "urf", "normal");
    private static final Set<String> TIERS = Set.of(
            "all",
            "ibsg",
            "gold_plus",
            "platinum_plus",
            "emerald_plus",
            "diamond_plus",
            "master",
            "master_plus",
            "grandmaster",
            "challenger"
    );
    private static final Set<String> POSITIONS = Set.of("top", "jungle", "mid", "adc", "support");

    private final OpggChampionDetailProvider detailProvider;
    private final OpggChampionListProvider listProvider;

    @Autowired
    public OpggChampionController(OpggChampionService service) {
        this(service, service);
    }

    OpggChampionController(OpggChampionDetailProvider detailProvider, OpggChampionListProvider listProvider) {
        this.detailProvider = detailProvider;
        this.listProvider = listProvider;
    }

    @GetMapping("/champions")
    public ResponseEntity<ApiResponse<OpggChampionList>> list(
            @RequestParam String mode,
            @RequestParam(defaultValue = REGION_KR) String region,
            @RequestParam(defaultValue = "all") String tier
    ) {
        OpggChampionListQuery query = validateList(mode, region, tier);
        try {
            return ResponseEntity.ok(ApiResponse.success(listProvider.getChampionList(query)));
        } catch (OpggSourceException exception) {
            return sourceFailure(exception);
        }
    }

    @GetMapping("/champions/{championId}/detail")
    public ResponseEntity<ApiResponse<OpggChampionDetail>> detail(
            @PathVariable int championId,
            @RequestParam String mode,
            @RequestParam(defaultValue = REGION_KR) String region,
            @RequestParam(required = false) String tier,
            @RequestParam(required = false) String position
    ) {
        OpggChampionDetailQuery query = validate(championId, mode, region, tier, position);
        try {
            return ResponseEntity.ok(ApiResponse.success(detailProvider.getChampionDetail(query)));
        } catch (OpggSourceException exception) {
            return sourceFailure(exception);
        }
    }

    private static <T> ResponseEntity<ApiResponse<T>> sourceFailure(OpggSourceException exception) {
        String message = exception.getMessage() == null
                ? "OP.GG source request failed"
                : exception.getMessage();
        return ResponseEntity
                .status(HttpStatus.BAD_GATEWAY)
                .body(ApiResponse.error(HttpStatus.BAD_GATEWAY.value(), message));
    }

    private static OpggChampionDetailQuery validate(
            int championId,
            String rawMode,
            String rawRegion,
            String rawTier,
            String rawPosition
    ) {
        if (championId <= 0) {
            throw new IllegalArgumentException("championId must be positive");
        }

        String mode = normalize(rawMode);
        if (!MODES.contains(mode)) {
            throw new IllegalArgumentException("Unsupported OP.GG mode: " + rawMode);
        }

        String region = normalize(rawRegion);
        if (!REGION_KR.equals(region)) {
            throw new IllegalArgumentException("Only OP.GG region=kr is supported");
        }

        if ("ranked".equals(mode)) {
            String tier = normalize(rawTier);
            String position = normalize(rawPosition);
            if (!TIERS.contains(tier) || "all".equals(tier)) {
                throw new IllegalArgumentException("Ranked OP.GG detail requires a supported tier");
            }
            if (!POSITIONS.contains(position)) {
                throw new IllegalArgumentException("Ranked OP.GG detail requires a lane position");
            }
            return new OpggChampionDetailQuery(championId, mode, region, tier, position);
        }

        String tier = normalize(rawTier);
        if (tier.isBlank()) {
            tier = "all";
        }
        if (!TIERS.contains(tier)) {
            throw new IllegalArgumentException("Unsupported OP.GG tier: " + rawTier);
        }
        return new OpggChampionDetailQuery(championId, mode, region, tier, "none");
    }

    private static OpggChampionListQuery validateList(String rawMode, String rawRegion, String rawTier) {
        String mode = normalize(rawMode);
        if (!MODES.contains(mode)) {
            throw new IllegalArgumentException("Unsupported OP.GG mode: " + rawMode);
        }

        String region = normalize(rawRegion);
        if (!REGION_KR.equals(region)) {
            throw new IllegalArgumentException("Only OP.GG region=kr is supported");
        }

        String tier = normalize(rawTier);
        if (tier.isBlank()) {
            tier = "all";
        }
        if (!TIERS.contains(tier)) {
            throw new IllegalArgumentException("Unsupported OP.GG tier: " + rawTier);
        }
        return new OpggChampionListQuery(mode, region, tier);
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
