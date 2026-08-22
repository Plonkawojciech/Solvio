#!/usr/bin/env ruby
# Adds a SolvioTests unit-test bundle target to Solvio.xcodeproj using the
# xcodeproj gem (the same library CocoaPods uses — safe, idempotent).
require 'xcodeproj'

PROJECT = File.expand_path(File.join(__dir__, '..', 'Solvio.xcodeproj'))
APP_NAME = 'Solvio'
TEST_NAME = 'SolvioTests'

project = Xcodeproj::Project.open(PROJECT)
app = project.targets.find { |t| t.name == APP_NAME }
abort "App target #{APP_NAME} not found" unless app

if project.targets.any? { |t| t.name == TEST_NAME }
  puts "[=] #{TEST_NAME} target already exists — refreshing files only"
  test = project.targets.find { |t| t.name == TEST_NAME }
else
  dt = app.deployment_target || '16.0'
  test = project.new_target(:unit_test_bundle, TEST_NAME, :ios, dt)
  test.add_dependency(app)
  puts "[+] created #{TEST_NAME} target (deployment #{dt})"
end

# Build settings for the test bundle.
test.build_configurations.each do |c|
  c.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.programo.solvio.tests'
  c.build_settings['TEST_HOST'] = '$(BUILT_PRODUCTS_DIR)/Solvio.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/Solvio'
  c.build_settings['BUNDLE_LOADER'] = '$(TEST_HOST)'
  c.build_settings['SWIFT_VERSION'] = '5.9'
  c.build_settings['GENERATE_INFOPLIST_FILE'] = 'YES'
  c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.0'
  c.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
  c.build_settings['DEVELOPMENT_TEAM'] = 'H7DS3ZG67S'
  c.build_settings['SWIFT_EMIT_LOC_STRINGS'] = 'NO'
end

# Ensure the app is testable in Debug so @testable import works.
app.build_configurations.each do |c|
  c.build_settings['ENABLE_TESTABILITY'] = 'YES' if c.name == 'Debug'
end

# (Re)attach the test source files.
group = project.main_group[TEST_NAME] || project.main_group.new_group(TEST_NAME, TEST_NAME)
existing_paths = test.source_build_phase.files_references.map { |r| r.real_path.to_s }
Dir.glob(File.join(__dir__, '..', TEST_NAME, '*.swift')).sort.each do |path|
  base = File.basename(path)
  next if existing_paths.any? { |p| File.basename(p) == base }
  ref = group.find_file_by_path(base) || group.new_file(base)
  test.add_file_references([ref])
  puts "[+] added #{base}"
end

project.save
puts '[✓] project saved'

# Make sure a shared scheme runs the tests.
scheme_dir = File.join(PROJECT, 'xcshareddata', 'xcschemes')
scheme_path = File.join(scheme_dir, "#{APP_NAME}.xcscheme")
scheme = File.exist?(scheme_path) ? Xcodeproj::XCScheme.new(scheme_path) : Xcodeproj::XCScheme.new
if (scheme.build_action.entries || []).empty?
  scheme.add_build_target(app)
end
unless scheme.test_action.testables.any? { |t| t.buildable_references.any? { |b| b.target_name == TEST_NAME } }
  scheme.test_action.add_testable(Xcodeproj::XCScheme::TestAction::TestableReference.new(test))
  puts '[+] added test target to scheme test action'
end
scheme.save_as(PROJECT, APP_NAME, true)
puts '[✓] shared scheme updated'
