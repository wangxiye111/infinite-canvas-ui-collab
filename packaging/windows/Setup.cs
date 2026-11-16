using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

internal static class Setup {
    [STAThread]
    private static void Main() {
        string directory = Path.Combine(Path.GetTempPath(), "InfiniteCanvasSetup-" + Guid.NewGuid().ToString("N"));
        try {
            Directory.CreateDirectory(directory);
            foreach (string name in new[] { "payload.zip", "install.ps1" }) {
                using (Stream input = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
                using (Stream output = File.Create(Path.Combine(directory, name))) {
                    if (input == null) throw new InvalidDataException("安装文件不完整，请重新下载安装包。");
                    input.CopyTo(output);
                }
            }
            ProcessStartInfo info = new ProcessStartInfo();
            info.FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), @"System32\WindowsPowerShell\v1.0\powershell.exe");
            info.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + Path.Combine(directory, "install.ps1") + "\"";
            info.WorkingDirectory = directory;
            info.UseShellExecute = false;
            info.CreateNoWindow = true;
            info.WindowStyle = ProcessWindowStyle.Hidden;
            info.EnvironmentVariables["PSModulePath"] = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), @"System32\WindowsPowerShell\v1.0\Modules");
            using (Process child = Process.Start(info)) {
                child.WaitForExit();
                if (child.ExitCode != 0) throw new Exception("安装程序未能启动，请解压备用安装包并双击 install.cmd。");
            }
        } catch (Exception error) {
            MessageBox.Show(error.Message, "无限画布安装", MessageBoxButtons.OK, MessageBoxIcon.Error);
        } finally {
            // This randomly named directory contains only this process's extracted resources.
            string prefix = Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if (Path.GetFullPath(directory).StartsWith(prefix, StringComparison.OrdinalIgnoreCase) && Path.GetFileName(directory).StartsWith("InfiniteCanvasSetup-", StringComparison.Ordinal)) {
                try { if (Directory.Exists(directory)) Directory.Delete(directory, true); } catch { }
            }
        }
    }
}
