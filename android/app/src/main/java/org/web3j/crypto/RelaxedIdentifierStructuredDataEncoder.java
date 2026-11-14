// Lives in web3j's package on purpose: in web3j 4.9.4 StructuredData.EIP712Message / Entry are
// package-private, so only a class in org.web3j.crypto can override validateStructuredData.
// App + web3j share one class loader on Android, so package-private access works at runtime.
// Written in Java because Kotlin does not allow a public override that names a package-private type.
package org.web3j.crypto;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * web3j's EIP-712 encoder with ONE difference: struct FIELD names may contain single spaces
 * (Aster's withdraw "Action" uses "destination Chain" and "aster chain"; web3j's strict
 * identifier regex rejects them with "Invalid Identifier ...").
 *
 * Only the validation is overridden. encodeType / encodeData / hashStruct / domain separator and
 * hashing are web3j's own code, unchanged. Field TYPES stay strictly validated with web3j's type
 * regex. Used ONLY by TransactionSigner.signAsterWithdraw (Aster withdraw Action); the existing
 * signTypedData and all other signing keep web3j's strict StructuredDataEncoder.
 *
 * Note: web3j calls validateStructuredData from its constructor (via parseJSONMessage), before
 * this subclass's instance fields exist, so the patterns are static.
 */
public class RelaxedIdentifierStructuredDataEncoder extends StructuredDataEncoder {

    // Same as web3j's identifier regex, plus internal single spaces between words.
    private static final Pattern RELAXED_IDENTIFIER =
            Pattern.compile("^[a-zA-Z_$][a-zA-Z_$0-9]*( [a-zA-Z_$0-9]+)*$");
    // web3j's type regex (unchanged).
    private static final Pattern STRICT_TYPE =
            Pattern.compile("^[a-zA-Z_$][a-zA-Z_$0-9]*(\\[([1-9]\\d*)*\\])*$");

    public RelaxedIdentifierStructuredDataEncoder(String jsonMessage) throws IOException, RuntimeException {
        super(jsonMessage);
    }

    @Override
    public void validateStructuredData(StructuredData.EIP712Message jsonMessageObject) throws RuntimeException {
        for (Map.Entry<String, List<StructuredData.Entry>> struct : jsonMessageObject.getTypes().entrySet()) {
            for (StructuredData.Entry entry : struct.getValue()) {
                if (!RELAXED_IDENTIFIER.matcher(entry.getName()).find()) {
                    throw new RuntimeException(
                            String.format("Invalid Identifier %s in %s", entry.getName(), struct.getKey()));
                }
                if (!STRICT_TYPE.matcher(entry.getType()).find()) {
                    throw new RuntimeException(
                            String.format("Invalid Type %s in %s", entry.getType(), struct.getKey()));
                }
            }
        }
    }
}
