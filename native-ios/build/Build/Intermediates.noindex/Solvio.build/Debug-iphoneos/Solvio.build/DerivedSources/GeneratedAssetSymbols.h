#import <Foundation/Foundation.h>

#if __has_attribute(swift_private)
#define AC_SWIFT_PRIVATE __attribute__((swift_private))
#else
#define AC_SWIFT_PRIVATE
#endif

/// The resource bundle ID.
static NSString * const ACBundleID AC_SWIFT_PRIVATE = @"com.programo.solvio";

/// The "Accent" asset catalog color resource.
static NSString * const ACColorNameAccent AC_SWIFT_PRIVATE = @"Accent";

/// The "Background" asset catalog color resource.
static NSString * const ACColorNameBackground AC_SWIFT_PRIVATE = @"Background";

/// The "Chart1" asset catalog color resource.
static NSString * const ACColorNameChart1 AC_SWIFT_PRIVATE = @"Chart1";

/// The "Chart2" asset catalog color resource.
static NSString * const ACColorNameChart2 AC_SWIFT_PRIVATE = @"Chart2";

/// The "Chart3" asset catalog color resource.
static NSString * const ACColorNameChart3 AC_SWIFT_PRIVATE = @"Chart3";

/// The "Chart4" asset catalog color resource.
static NSString * const ACColorNameChart4 AC_SWIFT_PRIVATE = @"Chart4";

/// The "Chart5" asset catalog color resource.
static NSString * const ACColorNameChart5 AC_SWIFT_PRIVATE = @"Chart5";

/// The "Chart6" asset catalog color resource.
static NSString * const ACColorNameChart6 AC_SWIFT_PRIVATE = @"Chart6";

/// The "Destructive" asset catalog color resource.
static NSString * const ACColorNameDestructive AC_SWIFT_PRIVATE = @"Destructive";

/// The "Foreground" asset catalog color resource.
static NSString * const ACColorNameForeground AC_SWIFT_PRIVATE = @"Foreground";

/// The "Info" asset catalog color resource.
static NSString * const ACColorNameInfo AC_SWIFT_PRIVATE = @"Info";

/// The "LaunchBackground" asset catalog color resource.
static NSString * const ACColorNameLaunchBackground AC_SWIFT_PRIVATE = @"LaunchBackground";

/// The "Muted" asset catalog color resource.
static NSString * const ACColorNameMuted AC_SWIFT_PRIVATE = @"Muted";

/// The "MutedForeground" asset catalog color resource.
static NSString * const ACColorNameMutedForeground AC_SWIFT_PRIVATE = @"MutedForeground";

/// The "Success" asset catalog color resource.
static NSString * const ACColorNameSuccess AC_SWIFT_PRIVATE = @"Success";

/// The "Surface" asset catalog color resource.
static NSString * const ACColorNameSurface AC_SWIFT_PRIVATE = @"Surface";

/// The "Warning" asset catalog color resource.
static NSString * const ACColorNameWarning AC_SWIFT_PRIVATE = @"Warning";

/// The "SplashLogo" asset catalog image resource.
static NSString * const ACImageNameSplashLogo AC_SWIFT_PRIVATE = @"SplashLogo";

#undef AC_SWIFT_PRIVATE
