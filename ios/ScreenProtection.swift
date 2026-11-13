import UIKit

enum ScreenProtectionPolicy {
  static func shouldObscure(isAppActive: Bool, isScreenCaptured: Bool) -> Bool {
    !isAppActive || isScreenCaptured
  }
}

final class ScreenProtectionController {
  private weak var window: UIWindow?
  private var privacyView: UIView?
  private var observers: [NSObjectProtocol] = []

  init(window: UIWindow) {
    self.window = window
  }

  func start() {
    let center = NotificationCenter.default
    observers.append(center.addObserver(
      forName: UIApplication.willResignActiveNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in self?.refresh() })
    observers.append(center.addObserver(
      forName: UIApplication.didBecomeActiveNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in self?.refresh() })
    observers.append(center.addObserver(
      forName: UIScreen.capturedDidChangeNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in self?.refresh() })
    refresh()
  }

  deinit {
    observers.forEach(NotificationCenter.default.removeObserver)
  }

  private func refresh() {
    guard let window else { return }
    let isActive = window.windowScene?.activationState == .foregroundActive
      || UIApplication.shared.applicationState == .active
    let obscure = ScreenProtectionPolicy.shouldObscure(
      isAppActive: isActive,
      isScreenCaptured: UIScreen.main.isCaptured
    )

    if obscure {
      if privacyView == nil {
        let view = UIView(frame: window.bounds)
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.backgroundColor = .systemBackground
        view.accessibilityIdentifier = "screen-protection-overlay"
        window.addSubview(view)
        privacyView = view
      }
      window.bringSubviewToFront(privacyView!)
    } else {
      privacyView?.removeFromSuperview()
      privacyView = nil
    }
  }
}
