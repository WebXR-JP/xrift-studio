cask "xrift-studio" do
  version "1.0.5"
  sha256 "89b5086399ff9dc721afe1028d7d97ca653376f164d734e410bd797a067d75a8"

  url "https://github.com/WebXR-JP/xrift-studio/releases/download/v#{version}/XRift.Studio_#{version}_darwin_universal_release.dmg"
  name "XRift Studio"
  desc "Create worlds and items for XRift"
  homepage "https://webxr-jp.github.io/xrift-studio/"

  auto_updates true
  depends_on :macos

  app "XRift Studio.app"
end
