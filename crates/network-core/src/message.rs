use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MessageType {
    Hello,
    HelloAck,
    CapabilityAdvertise,
    CapabilityRequest,
    CapabilityResponse,
    Ping,
    Pong,
    Disconnect,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkMessage<T> {
    pub message_id: String,
    pub sender_agent_id: String,
    pub recipient_agent_id: String,
    pub message_type: MessageType,
    pub timestamp: String,
    pub nonce: String,
    pub payload: T,
    pub signature: String,
    pub protocol_version: String,
}

impl<T: Serialize> NetworkMessage<T> {
    pub fn compute_canonical_preimage(&self) -> Result<String, serde_json::Error> {
        let v = serde_json::json!({
            "message_id": self.message_id,
            "sender_agent_id": self.sender_agent_id,
            "recipient_agent_id": self.recipient_agent_id,
            "message_type": self.message_type,
            "timestamp": self.timestamp,
            "nonce": self.nonce,
            "payload": self.payload,
            "protocol_version": self.protocol_version,
        });
        serde_json::to_string(&v)
    }
}
