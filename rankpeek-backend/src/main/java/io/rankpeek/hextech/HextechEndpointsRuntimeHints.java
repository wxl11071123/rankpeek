package io.rankpeek.hextech;

import org.springframework.aot.hint.RuntimeHints;
import org.springframework.aot.hint.RuntimeHintsRegistrar;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.ImportRuntimeHints;

/**
 * 把 {@code endpoints.properties} 显式注册进 native-image。
 *
 * <p>Spring Boot 的 native 构建默认只带 {@code application*.properties} 等固定名字，
 * 自定义资源要靠 GraalVM 的静态探测 —— 能命中（常量参数调用 {@code getResourceAsStream}）
 * 但不是保证。这里写死，免得原生包里悄悄丢掉配置、导致海斗自建功能整块消失。
 */
@Configuration(proxyBeanMethods = false)
@ImportRuntimeHints(HextechEndpointsRuntimeHints.Registrar.class)
public class HextechEndpointsRuntimeHints {

    static class Registrar implements RuntimeHintsRegistrar {

        @Override
        public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
            hints.resources().registerPattern(HextechEndpoints.RESOURCE);
        }
    }
}
