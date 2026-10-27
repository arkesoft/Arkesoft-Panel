import { createBaseConfig } from './eslint/base.js'

// Bu paketin kendisi .js (JSDoc tipli) dosyalardan oluşur; tip bilgisine dayalı
// kurallar yalnızca CONFIG_FILES bloğundan geçer.
export default createBaseConfig({ tsconfigRootDir: import.meta.dirname })
