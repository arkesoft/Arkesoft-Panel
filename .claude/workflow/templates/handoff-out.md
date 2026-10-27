# Dönen handoff paketi (Ajan → Orkestratör)

Üretim ve tasarım ajanları (`pm`, `po`, `architect`, `ux`, `ui`, `frontend`, `backend`,
`db`, `devops`, `docs`, `release`) bu şablonla döner. Serbest metin yasak.

```
AJAN: <ad>
DURUM: DONE | BLOCKED | NEEDS_INPUT
ÇIKTILAR: <dosya listesi — yol: ne yapıldı>
KARARLAR: <aldığın kararlar ve gerekçeleri, 1–5 madde>
VARSAYIMLAR: <doğrulanması gerekenler; yoksa "yok">
RİSKLER: <sonraki ajanların bilmesi gerekenler; yoksa "yok">
SONRAKİ AJAN İÇİN NOT: <isteğe bağlı>
```

## DURUM anlamları

| Durum         | Ne zaman                                                      | Orkestratör ne yapar                            |
| ------------- | ------------------------------------------------------------- | ----------------------------------------------- |
| `DONE`        | Tamamlanma tanımının tamamı karşılandı                        | Sonraki adıma geçer                             |
| `BLOCKED`     | Başka bir ajanın işi eksik (ör. backend şemayı bekliyor)      | Bağımlılığı tamamlar, tekrar çağırır            |
| `NEEDS_INPUT` | Kullanıcı kararı gerekiyor (yeni bağımlılık, belirsiz kapsam) | Makul varsayımla ilerler veya kullanıcıya sorar |

## Zorunlu alanlar

- `ÇIKTILAR` boş olamaz. Hiçbir dosya üretmediysen `DURUM` `DONE` olamaz.
- `KOŞTURULAN KOMUTLAR` alanı Bash erişimi olan ajanlar için zorunludur: komut → exit
  kodu → çıktı özeti. Komut çalıştırmadıysan bunu açıkça yaz.
- Kendi rolüne özel ek alanlar ajan dosyasında listelenmiştir; onları da doldur.
