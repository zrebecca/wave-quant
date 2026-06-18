import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";

/** Daily classic quotes (trading & life, attributed) — rotated by day-of-year. */
const QUOTES: { zh: string; en: string }[] = [
  { zh: "别人贪婪时我恐惧,别人恐惧时我贪婪。 — 沃伦·巴菲特", en: "Be fearful when others are greedy, and greedy when others are fearful. — Warren Buffett" },
  { zh: "人生就像滚雪球,重要的是找到很湿的雪和很长的坡。 — 沃伦·巴菲特", en: "Life is like a snowball — the important thing is finding wet snow and a really long hill. — Warren Buffett" },
  { zh: "风险来自于你不知道自己在做什么。 — 沃伦·巴菲特", en: "Risk comes from not knowing what you're doing. — Warren Buffett" },
  { zh: "想要得到某样东西,最可靠的办法是让自己配得上它。 — 查理·芒格", en: "The safest way to get what you want is to deserve what you want. — Charlie Munger" },
  { zh: "大钱不在买进卖出之中,而在等待之中。 — 查理·芒格", en: "The big money is not in the buying and selling, but in the waiting. — Charlie Munger" },
  { zh: "每天起床时,争取比昨天的自己更聪明一点。 — 查理·芒格", en: "Spend each day trying to be a little wiser than you were when you woke up. — Charlie Munger" },
  { zh: "市场短期是投票机,长期是称重机。 — 本杰明·格雷厄姆", en: "In the short run the market is a voting machine; in the long run it is a weighing machine. — Benjamin Graham" },
  { zh: "让我赚到大钱的从来不是我的思考,而是我的坐功。 — 杰西·利弗莫尔", en: "It was never my thinking that made the big money for me. It was always my sitting. — Jesse Livermore" },
  { zh: "知道你拥有什么,并且知道你为什么拥有它。 — 彼得·林奇", en: "Know what you own, and know why you own it. — Peter Lynch" },
  { zh: "牛市在绝望中诞生,在怀疑中成长,在乐观中成熟,在亢奋中消亡。 — 约翰·邓普顿", en: "Bull markets are born on pessimism, grow on skepticism, mature on optimism and die on euphoria. — John Templeton" },
  { zh: "你无法预测,但你可以准备。 — 霍华德·马克斯", en: "You can't predict. You can prepare. — Howard Marks" },
  { zh: "重要的不是你判断的对错,而是对的时候赚了多少,错的时候亏了多少。 — 乔治·索罗斯", en: "It's not whether you're right or wrong, but how much you make when you're right and how much you lose when you're wrong. — George Soros" },
  { zh: "复利是世界第八大奇迹,懂的人赚取它,不懂的人支付它。 — 爱因斯坦", en: "Compound interest is the eighth wonder of the world. He who understands it, earns it. — Albert Einstein" },
  { zh: "知道为什么而活的人,几乎能承受任何一种生活。 — 尼采", en: "He who has a why to live can bear almost any how. — Friedrich Nietzsche" },
  { zh: "世上只有一种英雄主义,就是看清生活的真相之后依然热爱生活。 — 罗曼·罗兰", en: "There is only one heroism in the world: to see the world as it is, and to love it. — Romain Rolland" },
  { zh: "一个人可以被毁灭,但不能被打败。 — 海明威", en: "A man can be destroyed but not defeated. — Ernest Hemingway" },
  { zh: "成功就是从失败到失败,依然热情不减。 — 丘吉尔", en: "Success is stumbling from failure to failure with no loss of enthusiasm. — Winston Churchill" },
  { zh: "自信是成功的第一秘诀。 — 爱默生", en: "Self-trust is the first secret of success. — Ralph Waldo Emerson" },
  { zh: "你的时间有限,不要浪费在过别人的生活上。 — 史蒂夫·乔布斯", en: "Your time is limited, so don't waste it living someone else's life. — Steve Jobs" },
  { zh: "求知若饥,虚心若愚。 — 史蒂夫·乔布斯", en: "Stay hungry, stay foolish. — Steve Jobs" },
  { zh: "生命中最伟大的光辉不在于永不坠落,而在于坠落后总能再度升起。 — 曼德拉", en: "The greatest glory in living lies not in never falling, but in rising every time we fall. — Nelson Mandela" },
  { zh: "千里之行,始于足下。 — 老子", en: "A journey of a thousand miles begins with a single step. — Lao Tzu" },
  { zh: "知之者不如好之者,好之者不如乐之者。 — 孔子", en: "Knowing is not as good as loving; loving is not as good as delighting. — Confucius" },
  { zh: "竹杖芒鞋轻胜马,谁怕?一蓑烟雨任平生。 — 苏轼", en: "Bamboo staff and straw sandals, lighter than a horse — who fears? A straw cloak in the misty rain, such is life. — Su Shi" },
  { zh: "人须在事上磨,方立得住。 — 王阳明", en: "One must be tempered by real affairs to stand firm. — Wang Yangming" },
  { zh: "二十年后,让你失望的不是你做过的事,而是你没做的事。扬帆起航吧。 — 马克·吐温", en: "Twenty years from now you will be more disappointed by the things you didn't do. So sail away. — Mark Twain" },
  { zh: "我们唯一值得恐惧的,是恐惧本身。 — 罗斯福", en: "The only thing we have to fear is fear itself. — Franklin D. Roosevelt" },
  { zh: "天空中没有留下翅膀的痕迹,但我已经飞过。 — 泰戈尔", en: "I leave no trace of wings in the air, but I am glad I have had my flight. — Rabindranath Tagore" },
  { zh: "付出不亚于任何人的努力。 — 稻盛和夫", en: "Exert effort second to none. — Kazuo Inamori" },
  { zh: "长风破浪会有时,直挂云帆济沧海。 — 李白", en: "One day the wind will break the waves — hoist the cloud-sail and cross the sea. — Li Bai" },
];

// Default weather location: Hangzhou (no geolocation prompt; fails silently).
const LAT = 30.27;
const LON = 120.16;

/** WMO weather code → [codes, icon, zh, en]. */
const WMO: [number[], string, string, string][] = [
  [[0], "☀️", "晴", "Sunny"],
  [[1, 2], "🌤️", "多云", "Partly cloudy"],
  [[3], "☁️", "阴", "Overcast"],
  [[45, 48], "🌫️", "雾", "Fog"],
  [[51, 53, 55, 56, 57], "🌦️", "毛毛雨", "Drizzle"],
  [[61, 63, 65, 66, 67, 80, 81, 82], "🌧️", "雨", "Rain"],
  [[71, 73, 75, 77, 85, 86], "❄️", "雪", "Snow"],
  [[95, 96, 99], "⛈️", "雷雨", "Thunderstorm"],
];

function wmoInfo(code: number) {
  return WMO.find(([codes]) => codes.includes(code)) ?? WMO[1];
}

/** Header left block: daily quote + date/weekday + live clock + weather. */
export default function HeaderMotto() {
  const { lang } = useI18n();
  const [now, setNow] = useState(() => new Date());
  const [wx, setWx] = useState<{ temp: number; code: number } | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let dead = false;
    const load = () =>
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weather_code`)
        .then((r) => r.json())
        .then((j) => {
          if (!dead && j?.current?.temperature_2m != null) {
            setWx({ temp: Math.round(j.current.temperature_2m), code: j.current.weather_code ?? 1 });
          }
        })
        .catch(() => {}); // weather is decorative — hide on failure
    load();
    const id = setInterval(load, 30 * 60 * 1000);
    return () => {
      dead = true;
      clearInterval(id);
    };
  }, []);

  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  const q = QUOTES[dayOfYear % QUOTES.length];
  const quote = lang === "zh" ? q.zh : q.en;
  const locale = lang === "zh" ? "zh-CN" : "en-US";
  const dateTxt = now.toLocaleDateString(locale, { year: "numeric", month: "numeric", day: "numeric", weekday: "short" });
  const timeTxt = now.toLocaleTimeString(locale, { hour12: false });
  const w = wx ? wmoInfo(wx.code) : null;
  // Cute summery accent, rotating daily along with the quote.
  // (+1 aligns the cycle so the watermelon lands on 2026-06-12.)
  const SUMMER_ICONS = ["🌻", "🌞", "🍃", "🍉", "🌴", "🐬", "🌈"];
  const icon = SUMMER_ICONS[(dayOfYear + 1) % SUMMER_ICONS.length];

  return (
    <div className="hdr-motto">
      <span className="hdr-quote" title={quote}>{icon} {quote}</span>
      <span className="hdr-meta mono">{dateTxt} {timeTxt}</span>
      {w && wx && (
        <span className="hdr-meta">
          {w[1]} {lang === "zh" ? w[2] : w[3]} {wx.temp}°C
        </span>
      )}
    </div>
  );
}
