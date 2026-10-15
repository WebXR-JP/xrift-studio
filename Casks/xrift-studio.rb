cask "xrift-studio" do
  version "1.0.7"
  sha256 "1ced06554c829fc85add7086f755bc87f3202ece9cdfebe234c5369abc885863"

  url "https://github.com/WebXR-JP/xrift-studio/releases/download/v#{version}/XRift.Studio_#{version}_darwin_universal_release.dmg"
  name "XRift Studio"
  desc "Create worlds and items for XRift"
  homepage "https://webxr-jp.github.io/xrift-studio/"

  auto_updates true
  depends_on :macos

  app "XRift Studio.app"
end
