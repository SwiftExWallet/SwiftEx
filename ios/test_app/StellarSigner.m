#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(StellarSigner, NSObject)

RCT_EXTERN_METHOD(
  getAssets:(NSString *)publicKey
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(signTransaction:(NSString *)transactionXDR
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(signTransactionForNetwork:(NSString *)transactionXDR
                  network:(NSString *)network
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
