"use client";

function padBase64(input: string) {
  return `${input}${"=".repeat((4 - (input.length % 4 || 4)) % 4)}`;
}

function base64urlToBuffer(value: string): ArrayBuffer {
  const base64 = padBase64(value.replace(/-/g, "+").replace(/_/g, "/"));
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function bufferToBase64url(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  const base64 = window.btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function mapCredentialDescriptor(descriptor: any) {
  return {
    ...descriptor,
    id: base64urlToBuffer(String(descriptor.id || "")),
  };
}

function serializeCredential(credential: any) {
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults?.() || {},
    response:
      "attestationObject" in credential.response
        ? {
            clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
            attestationObject: bufferToBase64url(credential.response.attestationObject),
            transports: credential.response.getTransports?.() || [],
          }
        : {
            clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
            authenticatorData: bufferToBase64url(credential.response.authenticatorData),
            signature: bufferToBase64url(credential.response.signature),
            userHandle: credential.response.userHandle ? bufferToBase64url(credential.response.userHandle) : null,
          },
  };
}

export async function startPasskeyRegistration(options: any) {
  const publicKey = {
    ...options,
    challenge: base64urlToBuffer(String(options.challenge || "")),
    user: {
      ...options.user,
      id: base64urlToBuffer(String(options.user?.id || "")),
    },
    excludeCredentials: Array.isArray(options.excludeCredentials) ? options.excludeCredentials.map(mapCredentialDescriptor) : [],
  };

  const credential = (await navigator.credentials.create({
    publicKey,
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error("Passkey registration was cancelled.");
  }

  return serializeCredential(credential);
}

export async function startPasskeyAuthentication(options: any) {
  const publicKey = {
    ...options,
    challenge: base64urlToBuffer(String(options.challenge || "")),
    allowCredentials: Array.isArray(options.allowCredentials) ? options.allowCredentials.map(mapCredentialDescriptor) : [],
  };

  const credential = (await navigator.credentials.get({
    publicKey,
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error("Passkey verification was cancelled.");
  }

  return serializeCredential(credential);
}
