use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct AgentIdentity {
    pub agent_id: String,
    pub public_key: String,
    pub key_algorithm: String,
    pub created_at: String,
}

impl AgentIdentity {
    pub fn derive_agent_id(public_key_bytes: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(public_key_bytes);
        let result = hasher.finalize();
        let hex = format!("{:x}", result);
        format!("agent_{}", &hex[..24])
    }

    pub fn verify_fingerprint(&self, public_key_bytes: &[u8]) -> bool {
        let expected = Self::derive_agent_id(public_key_bytes);
        self.agent_id == expected
    }
}

pub struct KeyPair {
    pub identity: AgentIdentity,
    pub private_key: String,
}
