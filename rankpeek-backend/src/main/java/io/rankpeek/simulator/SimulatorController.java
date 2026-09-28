package io.rankpeek.simulator;

import io.rankpeek.model.ApiResponse;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dev/simulator")
@ConditionalOnProperty(name = "rankpeek.simulator.enabled", havingValue = "true")
public class SimulatorController {
    private final SimulatorRuntimeService runtimeService;
    private final SimulatorSessionMapper sessionMapper;

    public SimulatorController(SimulatorRuntimeService runtimeService, SimulatorSessionMapper sessionMapper) {
        this.runtimeService = runtimeService;
        this.sessionMapper = sessionMapper;
    }

    @GetMapping("/state")
    public ApiResponse<SimulatorState> state() {
        return ApiResponse.success(runtimeService.state());
    }

    @GetMapping("/snapshot")
    public ApiResponse<SimulatorSnapshot> snapshot() {
        return ApiResponse.success(runtimeService.snapshot());
    }

    @GetMapping("/session-data")
    public ApiResponse<SimulatorSessionData> sessionData() {
        return ApiResponse.success(sessionMapper.toSessionData(runtimeService.snapshot()));
    }

    @PostMapping("/start")
    public ApiResponse<SimulatorSnapshot> start() {
        return ApiResponse.success(runtimeService.start());
    }

    @PostMapping("/stop")
    public ApiResponse<SimulatorSnapshot> stop() {
        return ApiResponse.success(runtimeService.stop());
    }

    @PostMapping("/reset")
    public ApiResponse<SimulatorSnapshot> reset() {
        return ApiResponse.success(runtimeService.reset());
    }

    @PostMapping("/next")
    public ApiResponse<SimulatorSnapshot> next() {
        return ApiResponse.success(runtimeService.next());
    }

    @PostMapping("/phase/{phase}")
    public ApiResponse<SimulatorSnapshot> setPhase(@PathVariable SimulatorPhase phase) {
        return ApiResponse.success(runtimeService.setPhase(phase));
    }

    @PostMapping("/round/{roundIndex}")
    public ApiResponse<SimulatorSnapshot> setRound(@PathVariable int roundIndex) {
        return ApiResponse.success(runtimeService.setRound(roundIndex));
    }
}
