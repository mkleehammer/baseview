define('TableViewPager', function() {
  // The pager displayed below the table.
  //
  // This is kind of a pain, but we use zero-based indexes in the table but want to display
  // one-based indexes.  Handlebars doesn't allow us to add one easily (and that doesn't sound
  // like a good helper) so we're going to make all of the display *and* links in the HTML one
  // based and we'll convert back to zero-based before notifying the table.

  'use strict';

  var BaseView = require('BaseView');

  return BaseView.extend({
    template: 'baseview/table-view/table-view-pager',

    events: {
      'click a': 'onPageClicked'
    },

    initialize: function(options) {
      this.table = options.table;
    },

    getTemplateContext: function() {
      // We always try to display 9 page links so that when we are in the middle we have:
      // - 1
      // - ...
      // - two previous
      // - current
      // - two next
      // - ...
      // - last
      //

      var page  = this.table.page;
      var pages = Math.ceil(this.table.data.length / this.table.pageSize);

      var ctx = {
        pages:    pages,
        current:  page+1,
        prevPage: (page === 0) ? null : page,
        nextPage: (page == pages-1) ? null : page+2
      };

      if (pages <= 9) {
        // If we don't have more than 9 pages, just display them all.
        ctx.start = 1;
        ctx.stop  = pages;
      } else if (page <= 4) {
        // We are near the beginning, so we'll display pages 1-7, leaving two slots for a right
        // ellipsis and the last page.
        ctx.start = 1;
        ctx.stop  = 7;
      } else if (pages - page <= 5)  {
        // We are near the end, so we'll display the last 7 pages, leaving two slots for the
        // first page and a left ellipsis.
        ctx.start = (pages - 6);
        ctx.stop  = pages;
      } else {
        // We are somewhere in the middle, so display the 5 around us leaving room for the
        // first and last pages, plus the ellipsis.
        ctx.start = (page - 3);
        ctx.stop  = (page + 2);
      }

      return ctx;
    },

    onPageClicked: function(e) {
      // The user has clicked a page.  Convert it to a zero-based page index and send it to the
      // table via a custom event.

      e.preventDefault();
      e.stopPropagation();

      var page = parseInt($(e.target).closest('a').attr('href').substr(1), 10) - 1;

      if (!isNaN(page))
        this.table.$el.trigger('base-table:change-page', [ page ]);
    }
  });

});
