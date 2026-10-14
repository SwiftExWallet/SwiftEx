import UIKit
import Security
import CommonCrypto

enum NativePinBottomSheet {
    private static func topViewController() -> UIViewController? {
        let root = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }.first { $0.isKeyWindow }?.rootViewController
        var top = root
        while let presented = top?.presentedViewController { top = presented }
        return top
    }

    static func show(completion: @escaping (String?) -> Void) {
        guard let presenter = topViewController() else { completion(nil); return }
        show(on: presenter, completion: completion)
    }

    static func show(on presenter: UIViewController, completion: @escaping (String?) -> Void) {
        let controller = UIViewController()
        controller.view.backgroundColor = .systemBackground
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 12
        stack.translatesAutoresizingMaskIntoConstraints = false
        controller.view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: controller.view.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: controller.view.trailingAnchor, constant: -24),
            stack.topAnchor.constraint(equalTo: controller.view.topAnchor, constant: 24),
            stack.bottomAnchor.constraint(equalTo: controller.view.safeAreaLayoutGuide.bottomAnchor, constant: -20),
        ])
        let title = UILabel()
        title.text = "Enter app PIN"
        title.font = .boldSystemFont(ofSize: 22)
        let subtitle = UILabel()
        subtitle.text = "Use your app PIN to continue securely."
        subtitle.textColor = .secondaryLabel
        let field = UITextField()
        field.placeholder = "6-digit PIN"
        field.textAlignment = .center
        field.keyboardType = .numberPad
        field.isSecureTextEntry = true
        field.textContentType = .oneTimeCode
        let actions = UIStackView()
        actions.axis = .horizontal
        actions.distribution = .fillEqually
        let cancel = UIButton(type: .system)
        cancel.setTitle("Cancel", for: .normal)
        let submit = UIButton(type: .system)
        submit.setTitle("Continue", for: .normal)
        actions.addArrangedSubview(cancel)
        actions.addArrangedSubview(submit)
        [title, subtitle, field, actions].forEach(stack.addArrangedSubview)
        cancel.addAction(UIAction { _ in controller.dismiss(animated: true) { completion(nil) } }, for: .touchUpInside)
        submit.addAction(UIAction { _ in
            guard let pin = field.text, pin.count == 6, pin.allSatisfy({ $0.isNumber }) else {
                field.layer.borderColor = UIColor.systemRed.cgColor
                field.layer.borderWidth = 1
                return
            }
            field.text = nil
            controller.dismiss(animated: true) { completion(pin) }
        }, for: .touchUpInside)
        controller.modalPresentationStyle = .pageSheet
        presenter.present(controller, animated: true) {
            if #available(iOS 15.0, *) {
                controller.sheetPresentationController?.detents = [.medium()]
                controller.sheetPresentationController?.prefersGrabberVisible = true
            }
            field.becomeFirstResponder()
        }
    }
}

enum AppPinVerifierIOS {
    private static let service = "com.appSwiftEx.appPinVerifier.v1"
    private static let account = "verifier"
    static func validate(_ pin: String) -> Bool {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                    kSecAttrService as String: service,
                                    kSecAttrAccount as String: account,
                                    kSecReturnData as String: true,
                                    kSecMatchLimit as String: kSecMatchLimitOne]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let decoded = Data(base64Encoded: data),
              let value = try? JSONSerialization.jsonObject(with: decoded) as? [String: Any],
              let saltText = value["salt"] as? String,
              let salt = Data(base64Encoded: saltText),
              let expectedText = value["verifier"] as? String,
              let expected = Data(base64Encoded: expectedText) else { return false }
        var actual = Data(repeating: 0, count: 32)
        actual.withUnsafeMutableBytes { output in
            salt.withUnsafeBytes { saltBytes in
                pin.withCString { pinBytes in
                    CCKeyDerivationPBKDF(CCPBKDFAlgorithm(kCCPBKDF2), pinBytes, pin.utf8.count,
                                         saltBytes.bindMemory(to: UInt8.self).baseAddress, salt.count,
                                         CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), 600000,
                                         output.bindMemory(to: UInt8.self).baseAddress, 32)
                }
            }
        }
        return actual == expected
    }
}
