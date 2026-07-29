// Astral SDK — Unit tests
// Tests for metrics, logging, and contracts

#include <gtest/gtest.h>

#include <astral/sdk/metrics.hpp>
#include <astral/sdk/logging.hpp>
#include <astral/sdk/contracts/invite.hpp>

namespace astral::sdk::test {

// ============================================================================
// Metrics tests
// ============================================================================

TEST(MetricsRegistry, IncrementCounter) {
    auto& registry = metrics::Registry::Instance();

    // Increment counter
    registry.IncrementCounter("test_counter", {{"label", "value"}}, 5);

    // Export and verify
    auto output = registry.ExportPrometheus();
    EXPECT_TRUE(output.find("test_counter") != std::string::npos);
    EXPECT_TRUE(output.find("label=\"value\"") != std::string::npos);
}

TEST(MetricsRegistry, ObserveHistogram) {
    auto& registry = metrics::Registry::Instance();

    // Observe values
    registry.ObserveHistogram("test_histogram", {{"path", "/test"}}, 0.05);
    registry.ObserveHistogram("test_histogram", {{"path", "/test"}}, 0.1);
    registry.ObserveHistogram("test_histogram", {{"path", "/test"}}, 0.2);

    auto output = registry.ExportPrometheus();
    EXPECT_TRUE(output.find("test_histogram") != std::string::npos);
    EXPECT_TRUE(output.find("_bucket") != std::string::npos);
    EXPECT_TRUE(output.find("_sum") != std::string::npos);
    EXPECT_TRUE(output.find("_count") != std::string::npos);
}

TEST(MetricsRegistry, SetGauge) {
    auto& registry = metrics::Registry::Instance();

    registry.SetGauge("test_gauge", {{"name", "value"}}, 42.5);

    auto output = registry.ExportPrometheus();
    EXPECT_TRUE(output.find("test_gauge") != std::string::npos);
    EXPECT_TRUE(output.find("42.5") != std::string::npos);
}

TEST(MetricsRegistry, PredefinedMetrics) {
    // Test that predefined metric names work
    auto output = metrics::Registry::Instance().ExportPrometheus();

    // Metrics should be empty initially
    EXPECT_TRUE(output.find("scylla_requests_total") != std::string::npos);
}

// ============================================================================
// Logging tests
// ============================================================================

TEST(Logging, LogLevels) {
    auto& logger = logging::Logger::Instance();

    // Test different log levels
    EXPECT_NO_THROW(logger.Debug("Debug message"));
    EXPECT_NO_THROW(logger.Info("Info message"));
    EXPECT_NO_THROW(logger.Warn("Warning message"));
    EXPECT_NO_THROW(logger.Error("Error message"));
}

TEST(Logging, LogWithFields) {
    auto& logger = logging::Logger::Instance();

    std::unordered_map<std::string, std::string> fields = {
        {"key1", "value1"},
        {"key2", "value2"}
    };

    EXPECT_NO_THROW(logger.Info("Message with fields", fields));
}

TEST(Logging, LogEntry) {
    logging::Entry entry;
    entry.level = logging::Level::Info;
    entry.service = "test-service";
    entry.message = "Test message";
    entry.fields = {{"field", "value"}};

    // Should not throw
    logging::Log(logging::Level::Info, std::move(entry));
}

TEST(Logging, EntryBuilder) {
    auto entry = logging::EntryBuilder{}
        .WithService("test")
        .WithField("key", "value")
        .WithField("count", 42)
        .WithDuration(150)
        .WithStatus(200)
        .Build();

    EXPECT_EQ(entry.service, "test");
    EXPECT_TRUE(entry.fields.find("key") != entry.fields.end());
    EXPECT_TRUE(entry.fields.find("count") != entry.fields.end());
    EXPECT_TRUE(entry.fields.find("duration_ms") != entry.fields.end());
    EXPECT_TRUE(entry.fields.find("status") != entry.fields.end());
}

// ============================================================================
// Contracts tests
// ============================================================================

TEST(InviteContract, FromJson) {
    nlohmann::json json = {
        {"code", "abc123"},
        {"guild_id", "456"},
        {"channel_id", "789"},
        {"inviter_id", "user1"},
        {"max_uses", 10},
        {"uses", 3},
        {"temporary", false}
    };

    auto invite = contracts::InviteResponse::FromJson(json);

    EXPECT_EQ(invite.code, "abc123");
    EXPECT_EQ(invite.guild_id, "456");
    EXPECT_EQ(invite.channel_id, "789");
    EXPECT_EQ(invite.inviter_id, "user1");
    EXPECT_EQ(invite.max_uses, 10);
    EXPECT_EQ(invite.uses, 3);
    EXPECT_EQ(invite.temporary, false);
}

TEST(InviteContract, ToJson) {
    contracts::InviteResponse invite;
    invite.code = "test123";
    invite.guild_id = "111";
    invite.channel_id = "222";
    invite.inviter_id = "333";
    invite.inviter = "TestUser";
    invite.max_uses = 5;
    invite.uses = 1;
    invite.temporary = true;

    auto json = invite.ToJson();

    EXPECT_EQ(json["code"], "test123");
    EXPECT_EQ(json["guild_id"], "111");
    EXPECT_EQ(json["temporary"], true);
    EXPECT_EQ(json["type"], 0);  // Should include type field
}

TEST(InviteContract, ErrorResponse) {
    auto error = contracts::InviteResponse::ErrorResponse(404, "Not found");

    EXPECT_EQ(error["code"], 404);
    EXPECT_EQ(error["message"], "Not found");
}

TEST(InviteContract, EntityToResponse) {
    contracts::Invite entity;
    entity.code = "entity123";
    entity.guild_id = "g1";
    entity.channel_id = "c1";
    entity.inviter_id = "u1";
    entity.max_uses = 10;
    entity.uses = 5;
    entity.temporary = false;

    auto response = contracts::InviteResponse::FromEntity(entity);

    EXPECT_EQ(response.code, "entity123");
    EXPECT_EQ(response.max_uses, 10);
    EXPECT_EQ(response.uses, 5);
}

// ============================================================================
// Integration tests
// ============================================================================

TEST(Integration, AllComponents) {
    // Test that all components can be used together
    auto& registry = metrics::Registry::Instance();

    registry.IncrementCounter("integration_test", {{"test", "true"}});
    registry.ObserveHistogram("integration_duration", {{"test", "true"}}, 0.05);

    logging::Log(logging::Level::Info, {
        .service = "integration-test",
        .message = "All components work together",
        .fields = {{"status", "ok"}}
    });

    // Verify metrics are recorded
    auto metrics_output = registry.ExportPrometheus();
    EXPECT_TRUE(metrics_output.find("integration_test") != std::string::npos);
}

}  // namespace astral::sdk::test