from pathlib import Path
from zipfile import ZipFile
import shutil

root = Path(__file__).resolve().parents[1]
tools = root / '.tools'
for archive, target in [('jdk.zip', 'jdk'), ('platforms-android-35.zip', 'platform'), ('build-tools-35.0.0.zip', 'build-tools'), ('platform-tools.zip', 'platform-tools')]:
    output = tools / target
    if not output.exists():
        output.mkdir()
        with ZipFile(tools / archive) as z:
            for item in z.infolist():
                dest = (output / item.filename).resolve()
                if not dest.is_relative_to(output.resolve()):
                    raise ValueError('Unsafe archive path')
            z.extractall(output)
    print('Ready:', target)
(root / 'res/drawable').mkdir(exist_ok=True)
shutil.copyfile(root.parent / 'desktop/app/icon.png', root / 'res/drawable/icon.png')
