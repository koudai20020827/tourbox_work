#include <errno.h>
#include <libgen.h>
#include <mach-o/dyld.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static void fail(const char *message) {
  FILE *log = fopen("launch.log", "a");
  if (log) {
    fprintf(log, "Launcher error: %s: %s\n", message, strerror(errno));
    fclose(log);
  }
  _exit(1);
}

int main(void) {
  char executable_path[4096];
  uint32_t size = sizeof(executable_path);
  if (_NSGetExecutablePath(executable_path, &size) != 0) {
    errno = ENAMETOOLONG;
    fail("Could not resolve executable path");
  }

  char macos_dir[4096];
  strncpy(macos_dir, executable_path, sizeof(macos_dir) - 1);
  macos_dir[sizeof(macos_dir) - 1] = '\0';
  char *launcher_dir = dirname(macos_dir);

  char script_path[4096];
  snprintf(script_path, sizeof(script_path), "%s/launch.sh", launcher_dir);

  execl("/bin/zsh", "zsh", script_path, (char *)NULL);
  fail("Could not execute launch.sh");
}
