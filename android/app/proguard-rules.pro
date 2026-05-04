# Kotlinx Serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.programo.solvio.**$$serializer { *; }
-keepclassmembers class com.programo.solvio.** {
    *** Companion;
}
-keepclasseswithmembers class com.programo.solvio.** {
    kotlinx.serialization.KSerializer serializer(...);
}
