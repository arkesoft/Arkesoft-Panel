---
'@arkesoft/api': patch
---

Çapraz-site istek koruması (CSRF) güçlendirildi: `Referer` başlığı üzerinden yapılan
kontrol, güvenli HTTP metotlarında (`GET`/`HEAD`/`OPTIONS`) da sıkı kalacak şekilde
açıkça pinlendi ve testle doğrulandı. Operatörler artık güvenilir kaynak (origin)
listesine isteğe bağlı olarak ek alan adları ekleyebiliyor (yeni opsiyonel
`ADDITIONAL_TRUSTED_ORIGINS` ortam değişkeni, virgülle ayrılmış, en fazla 8 adet;
tanımlanmazsa davranış bugünküyle bayt-birebir aynı kalır). Yanlış yapılandırma
nedeniyle reddedilen istekler artık işletme kayıtlarında teşhis edilebiliyor (hangi
kontrolün reddettiği, kaç güvenilir kaynak tanımlı olduğu) — isteğin gerçek
`Origin`/`Referer` değeri hiçbir zaman kayda yazılmıyor. Süper admin uçtan uca
testleri artık varsayılan olmayan bir geliştirme portunda da sorunsuzca çalışabiliyor.
[v0.0.21.1]
