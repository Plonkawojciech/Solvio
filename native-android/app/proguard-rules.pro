-keepattributes Signature, InnerClasses, EnclosingMethod
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations
-keepattributes AnnotationDefault

-keep,includedescriptorclasses class com.programo.solvio.**$$serializer { *; }
-keepclassmembers class com.programo.solvio.** {
    *** Companion;
}
-keepclasseswithmembers class com.programo.solvio.** {
    kotlinx.serialization.KSerializer serializer(...);
}
