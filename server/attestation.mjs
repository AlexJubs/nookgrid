import {verifyAttestation,verifyAssertion} from 'node-app-attest';
import cbor from 'cbor';
import {X509Certificate} from 'node:crypto';

// The library checks Apple's root, nonce, app identity, key ID and environment.
// Add strict CBOR shape and certificate validity checks before accepting a key.
export function appleVerifier({teamIdentifier,bundleIdentifier = 'com.nookgrid.app'}) {
  if (!/^[A-Z0-9]{10}$/.test(teamIdentifier || '')) throw Error('Personal Apple team ID required');
  return {
    attest({attestation,challenge,keyId}) {
      const objects = cbor.decodeAllSync(attestation);
      if (objects.length !== 1) throw Error('Invalid attestation');
      const chain = objects[0]?.attStmt?.x5c;
      if (!Array.isArray(chain) || chain.length !== 2) throw Error('Invalid certificate chain');
      for (const bytes of chain) {
        const certificate = new X509Certificate(bytes), now = Date.now();
        if (now < Date.parse(certificate.validFrom) || now > Date.parse(certificate.validTo)) throw Error('Expired certificate');
      }
      return verifyAttestation({attestation,challenge,keyId,teamIdentifier,bundleIdentifier,allowDevelopmentEnvironment:false});
    },
    assert(params) {
      const objects = cbor.decodeAllSync(params.assertion);
      if (objects.length !== 1 || !Buffer.isBuffer(objects[0]?.signature) || !Buffer.isBuffer(objects[0]?.authenticatorData) || objects[0].authenticatorData.length !== 37) throw Error('Invalid assertion');
      return verifyAssertion({...params,teamIdentifier,bundleIdentifier});
    }
  };
}
