# MealPlanner ProGuard / R8 Rules for Release AAB/APK
-keep class pl.mealplanner.app.MainActivity { *; }
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-dontwarn android.webkit.**
