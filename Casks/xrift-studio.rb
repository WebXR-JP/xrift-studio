cask "xrift-studio" do
  version "0.10.6"
  sha256 "3f9950d23c3155bbab8e575e6ed622f3dacfb279d57d67585f1be4f119ccf146"

  url "https://github.com/WebXR-JP/xrift-studio/releases/download/v#{version}/XRift.Studio_#{version}_darwin_universal_release.dmg"
  name "XRift Studio"
  desc "Create worlds and items for XRift"
  homepage "https://webxr-jp.github.io/xrift-studio/"

  auto_updates true
  depends_on :macos

  app "XRift Studio.app"
end
