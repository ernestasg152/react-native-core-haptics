Pod::Spec.new do |s|
  s.name           = 'ScrubHaptics'
  s.version        = '1.0.0'
  s.summary        = 'Core Haptics-backed scrub feedback for Expo'
  s.description    = 'Low-latency, non-coalesced transient haptics for rapid chart scrub feedback.'
  s.author         = ''
  s.homepage       = 'https://google.com'
  s.platforms      = { :ios => '13.0' }
  s.source         = { :git => 'https://google.com' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.swift'
  s.swift_version = '5.4'
end
