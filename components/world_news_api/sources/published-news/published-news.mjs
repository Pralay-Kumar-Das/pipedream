import app from "../../world_news_api.app.mjs";
import { DEFAULT_POLLING_SOURCE_TIMER_INTERVAL } from "@pipedream/platform";
import { getCommaSeparatedListFromArray } from "../../common/helpers.mjs";

export default {
  // eslint-disable-next-line pipedream/source-name
  name: "Published News",
  description: "Emit new event whenever recent news are published. Calling this endpoint requires 1 point per page, up to 1000 news. [See the docs here](https://worldnewsapi.com/docs/#Search-News)",
  key: "world_news_api-published-news",
  version: "0.0.1",
  type: "source",
  dedupe: "unique",
  props: {
    app,
    timer: {
      label: "Polling Interval",
      description: "Pipedream will poll the World News API on this schedule",
      type: "$.interface.timer",
      default: {
        intervalSeconds: DEFAULT_POLLING_SOURCE_TIMER_INTERVAL,
      },
    },
    db: "$.service.db",
    text: {
      propDefinition: [
        app,
        "text",
      ],
    },
    sourceCountries: {
      propDefinition: [
        app,
        "sourceCountries",
      ],
    },
    language: {
      propDefinition: [
        app,
        "language",
      ],
    },
    minSentiment: {
      propDefinition: [
        app,
        "minSentiment",
      ],
    },
    maxSentiment: {
      propDefinition: [
        app,
        "maxSentiment",
      ],
    },
    earliestPublishedDate: {
      propDefinition: [
        app,
        "earliestPublishedDate",
      ],
    },
    latestPublishedDate: {
      propDefinition: [
        app,
        "latestPublishedDate",
      ],
    },
    newsSources: {
      propDefinition: [
        app,
        "newsSources",
      ],
    },
    authors: {
      propDefinition: [
        app,
        "authors",
      ],
    },
    entities: {
      propDefinition: [
        app,
        "entities",
      ],
    },
    locationFilter: {
      propDefinition: [
        app,
        "locationFilter",
      ],
    },
    maxExecutions: {
      type: "integer",
      label: "Max pages to fetch per run",
      description: "The maximum number of pages to fetch per run. **Note**: this component will emit a maximum of 1000 news per run, which means 10.",
    },
  },
  methods: {
    emit(data) {
      this.$emit(data, {
        id: data.id,
        summary: data.title,
        ts: Date.now(),
      });
    },
    setLastId(id) {
      this.db.set("lastId", id);
    },
    getLastId() {
      return this.db.get("lastId");
    },
    async getCurrentPageRawData(offset, itemsPerPage) {
      const params = {
        "text": this.text || undefined,
        "source-countries": getCommaSeparatedListFromArray(this.sourceCountries),
        "language": this.language || undefined,
        "min-sentiment": this.minSentiment || undefined,
        "max-sentiment": this.maxSentiment || undefined,
        "earliest-publish-date": this.earliestPublishedDate || undefined,
        "latest-publish-date": this.latestPublishedDate || undefined,
        "news-sources": getCommaSeparatedListFromArray(this.newsSources),
        "authors": getCommaSeparatedListFromArray(this.authors),
        "entities": getCommaSeparatedListFromArray(this.entities),
        "location-filter": this.locationFilter || undefined,
        "offset": offset,
        "number": itemsPerPage,
        "sort": "publish-time",
        "sort-direction": "DESC",
      };
      const res = await this.app.searchNews(params);
      return res;
    },
    getCurrentPageNewsArray(res, lastEmmitedId) {
      const newsArr = [];
      let foundLastEmmitedId = false;
      for (const news of res.news.reverse()) {
        if (news.id === lastEmmitedId) {
          foundLastEmmitedId = true;
          break;
        }
        newsArr.unshift(news);
      }

      return {
        news: newsArr,
        foundLastEmmitedId,
      };
    },
    async fetchNews(itemsPerPage, maxCallsPerExecution, updateLastId = true) {
      const ITEMS_PER_PAGE = itemsPerPage ?? 100;
      const MAX_CALLS_PER_EXECUTION = maxCallsPerExecution ?? 10;
      const MAX_OFFSET = Math.min(MAX_CALLS_PER_EXECUTION, this.maxExecutions) * ITEMS_PER_PAGE;
      console.log(`Fetching news... (up to ${MAX_OFFSET}),`);

      const lastEmmitedId = this.getLastId();
      const newsToEmit = [];
      let offset = 0;

      do {
        const res = await this.getCurrentPageRawData(offset, ITEMS_PER_PAGE);
        if (res.news.length === 0) {
          break;
        }

        const {
          news,
          foundLastEmmitedId,
        } = this.getCurrentPageNewsArray(res, lastEmmitedId);
        newsToEmit.unshift(...news);
        if (foundLastEmmitedId) {
          break;
        }

        offset += ITEMS_PER_PAGE;
      } while (offset < MAX_OFFSET);

      if (newsToEmit.length > 0 && updateLastId) {
        this.setLastId(newsToEmit[newsToEmit.length - 1].id);
      }

      for (const news of newsToEmit) {
        this.emit(news);
      }
    },
  },
  hooks: {
    async activate() {
      await this.fetchNews(20, 1, false);
    },
  },
  async run() {
    await this.fetchNews();
  },
};