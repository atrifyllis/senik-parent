rootProject.name = "senik-parent"

includeBuild("../common")
includeBuild("../senik")
includeBuild("../senik-admin")

dependencyResolutionManagement {
    repositories {
        mavenLocal()
    }
    versionCatalogs {
        create("libs") {
            from("gr.alx:versions:1.0")
        }
    }
}
