use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RiskLevel {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Capability {
    pub capability_id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub input_schema: serde_json::Value,
    pub output_schema: serde_json::Value,
    pub required_permissions: Vec<String>,
    pub risk_level: RiskLevel,
    pub provider_agent_id: String,
    pub availability: String,
}

impl Capability {
    pub fn is_arbitrary_code_execution(&self) -> bool {
        let n = self.name.to_lowercase();
        let d = self.description.to_lowercase();
        let banned = ["eval", "shell_exec", "arbitrary_code", "system_exec", "remote_shell"];
        banned.iter().any(|b| n.contains(b) || d.contains(b))
    }
}
