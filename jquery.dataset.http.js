/*
* jQuery Data Set Framework : http base datasets plugin
* Copyright (c) 2010 Adobe Systems Incorporated - Kin Blas (jblas@adobe.com)
* Dual licensed under the MIT (MIT-LICENSE.txt) and GPL (GPL-LICENSE.txt) licenses.
* Note: Code is in draft form and is subject to change 
*/

(function($,window,document,undefined){

var DataSet = $.dataset.DataSet;

function HTTPSourceDataSet(dataSetURL, dataSetOptions)
{
	// Call the constructor for our DataSet base class so that
	// our base class properties get defined. We'll call setOptions
	// manually after we set up our HTTPSourceDataSet properties.

	DataSet.call(this);

	// HTTPSourceDataSet Properties:

	this.url = dataSetURL;
	this.dataSetsForDataRefStrings = new Array;
	this.hasDataRefStrings = false;
	this.useCache = true;

	this.setRequestInfo(dataSetOptions, true);

	$.extend(this, dataSetOptions);

	this.recalculateDataSetDependencies();

	if (this.loadInterval > 0)
		this.startLoadInterval(this.loadInterval);
}

$.extend(HTTPSourceDataSet.prototype, DataSet.prototype, {
	setRequestInfo: function(requestInfo, undefineRequestProps)
	{
		// Create a loadURL request object to store any load options
		// the caller specified. We'll fill in the URL at the last minute
		// before we make the actual load request because our URL needs
		// to be processed at the last possible minute in case it contains
		// data references.
	
		this.requestInfo = new Spry.Utils.loadURL.Request();
		this.requestInfo.extractRequestOptions(requestInfo, undefineRequestProps);
	
		// If the caller wants to use "POST" to fetch the data, but didn't
		// provide the content type, default to x-www-form-urlencoded.
	
		if (this.requestInfo.method == "POST")
		{
			if (!this.requestInfo.headers)
				this.requestInfo.headers = {};
			if (!this.requestInfo.headers['Content-Type'])
				this.requestInfo.headers['Content-Type'] = "application/x-www-form-urlencoded; charset=UTF-8";
		}
	},
	
	recalculateDataSetDependencies: function()
	{
		this.hasDataRefStrings = false;
	
		// Clear all old callbacks that may have been registered.
	
		var i = 0;
		for (i = 0; i < this.dataSetsForDataRefStrings.length; i++)
		{
			var ds = this.dataSetsForDataRefStrings[i];
			if (ds)
				ds.removeObserver(this);
		}
	
		// Now run through the strings that may contain data references and figure
		// out what data sets they require. Note that the data references in these
		// strings must be fully qualified with a data set name. (ex: {dsDataSetName::columnName})
	
		this.dataSetsForDataRefStrings = new Array();
	
		var regionStrs = this.getDataRefStrings();
	
		var dsCount = 0;
	
		for (var n = 0; n < regionStrs.length; n++)
		{
			var tokens = Spry.Data.Region.getTokensFromStr(regionStrs[n]);
	
			for (i = 0; tokens && i < tokens.length; i++)
			{
				if (tokens[i].search(/{[^}:]+::[^}]+}/) != -1)
				{
					var dsName = tokens[i].replace(/^\{|::.*\}/g, "");
					var ds = null;
					if (!this.dataSetsForDataRefStrings[dsName])
					{
						ds = Spry.Data.getDataSetByName(dsName);
						if (dsName && ds)
						{
							// The dataSetsForDataRefStrings array serves as both an
							// array of data sets and a hash lookup by name.
	
							this.dataSetsForDataRefStrings[dsName] = ds;
							this.dataSetsForDataRefStrings[dsCount++] = ds;
							this.hasDataRefStrings = true;
						}
					}
				}
			}
		}
	
		// Set up observers on any data sets our URL depends on.
	
		for (i = 0; i < this.dataSetsForDataRefStrings.length; i++)
		{
			var ds = this.dataSetsForDataRefStrings[i];
			ds.addObserver(this);
		}
	},
	
	getDataRefStrings: function()
	{
		var strArr = [];
		if (this.url) strArr.push(this.url);
		if (this.requestInfo && this.requestInfo.postData) strArr.push(this.requestInfo.postData);
		return strArr;
	},
	
	attemptLoadData: function()
	{
		// We only want to trigger a load when all of our data sets have data!
		for (var i = 0; i < this.dataSetsForDataRefStrings.length; i++)
		{
			var ds = this.dataSetsForDataRefStrings[i];
			if (ds.getLoadDataRequestIsPending() || !ds.getDataWasLoaded())
				return;
		}
	
		this.loadData();
	},
	
	onCurrentRowChanged: function(ds, data)
	{
		this.attemptLoadData();
	},
	
	onPostSort: function(ds, data)
	{
		this.attemptLoadData();
	},
	
	onDataChanged:  function(ds, data)
	{
		this.attemptLoadData();
	},
	
	loadData: function()
	{
		if (!this.url)
			return;
	
		this.cancelLoadData();
	
		var url = this.url;
		var postData = this.requestInfo.postData;
	
		if (this.hasDataRefStrings)
		{
			var allDataSetsReady = true;
	
			for (var i = 0; i < this.dataSetsForDataRefStrings.length; i++)
			{
				var ds = this.dataSetsForDataRefStrings[i];
				if (ds.getLoadDataRequestIsPending())
					allDataSetsReady = false;
				else if (!ds.getDataWasLoaded())
				{
					// Kick off the load of this data set!
					ds.loadData();
					allDataSetsReady = false;
				}
			}
	
			// If our data sets aren't ready, just return. We'll
			// get called back to load our data when they are all
			// done.
	
			if (!allDataSetsReady)
				return;
	
			url = Spry.Data.Region.processDataRefString(null, this.url, this.dataSetsForDataRefStrings);
			if (!url)
				return;
	
			if (postData && (typeof postData) == "string")
				postData = Spry.Data.Region.processDataRefString(null, postData, this.dataSetsForDataRefStrings);
		}
	
		this.notifyObservers("onPreLoad");
	
		this.data = null;
		this.dataWasLoaded = false;
		this.unfilteredData = null;
		this.dataHash = null;
		this.curRowID = 0;
	
		// At this point the url should've been processed if it contained any
		// data references. Set the url of the requestInfo structure and pass it
		// to LoadManager.loadData().
	
		var req = this.requestInfo.clone();
		req.url = url;
		req.postData = postData;
	
		this.pendingRequest = new Object;
		this.pendingRequest.data = Spry.Data.HTTPSourceDataSet.LoadManager.loadData(req, this, this.useCache);
	},
	
	cancelLoadData: function()
	{
		if (this.pendingRequest)
		{
			Spry.Data.HTTPSourceDataSet.LoadManager.cancelLoadData(this.pendingRequest.data, this);
			this.pendingRequest = null;
		}
	},
	
	getURL: function() { return this.url; },
	setURL: function(url, requestOptions)
	{
		if (this.url == url)
		{
			// The urls match so we may not have to do anything, but
			// before we bail early, check to see if the method and
			// postData that was last used was the same. If there is a
			// difference, we need to process the new URL.
	
			if (!requestOptions || (this.requestInfo.method == requestOptions.method && (requestOptions.method != "POST" || this.requestInfo.postData == requestOptions.postData)))
				return;
		}
	
		this.url = url;
	
		this.setRequestInfo(requestOptions);
	
		this.cancelLoadData();
		this.recalculateDataSetDependencies();
		this.dataWasLoaded = false;
	},
	
	setDataFromDoc: function(rawDataDoc)
	{
		this.pendingRequest = null;
	
		this.loadDataIntoDataSet(rawDataDoc);
		this.applyColumnTypes();
	
		this.disableNotifications();
		this.filterAndSortData();
		this.enableNotifications();
	
		this.notifyObservers("onPostLoad");
		this.notifyObservers("onDataChanged");
	},
	
	loadDataIntoDataSet: function(rawDataDoc)
	{
		// this method needs to be overwritten by the descendent classes;
		// internal data structures (data & dataHash) have to load data from the source document (ResponseText | ResponseDoc);
	
		this.dataHash = new Object;
		this.data = new Array;
		this.dataWasLoaded = true;
	},
	
	xhRequestProcessor: function(xhRequest)
	{
		// This method needs to be overwritten by the descendent classes if other objects (like responseXML)
		// are going to be used as a data source
		// This implementation returns the responseText from xhRequest
	
		var resp = xhRequest.responseText;
	
		if (xhRequest.status == 200 || xhRequest.status == 0)
			return resp;
		return null;
	},
	
	sessionExpiredChecker: function(req)
	{
		if (req.xhRequest.responseText == 'session expired')
			return true;
		return false;
	},
	
	setSessionExpiredChecker: function(checker)
	{
		this.sessionExpiredChecker = checker;
	},
	
	
	onRequestResponse: function(cachedRequest, req)
	{
		this.setDataFromDoc(cachedRequest.rawData);
	},
	
	onRequestError: function(cachedRequest, req)
	{
		this.notifyObservers("onLoadError", req);
		// Spry.Debug.reportError("Spry.Data.HTTPSourceDataSet.LoadManager.CachedRequest.loadDataCallback(" + req.xhRequest.status + ") failed to load: " + req.url + "\n");
	},
	
	onRequestSessionExpired: function(cachedRequest, req)
	{
		this.notifyObservers("onSessionExpired", req);
		//Spry.Debug.reportError("Spry.Data.HTTPSourceDataSet.LoadManager.CachedRequest.loadDataCallback(" + req.xhRequest.status + ") failed to load: " + req.url + "\n");
	}
});

// We don't add the HTTPDataSource class to the $.dataset.plugins dictionary
// because it isn't meant to be invoked directly. We simply expose it for others
// to derive their own data sets.

$.dataset.HTTPDataSource = HTTPDataSource;

})(jQuery, window, document);

/*
Spry.Data.HTTPSourceDataSet.LoadManager = {};
Spry.Data.HTTPSourceDataSet.LoadManager.cache = [];

Spry.Data.HTTPSourceDataSet.LoadManager.CachedRequest = function(reqInfo, xhRequestProcessor, sessionExpiredChecker)
{
	Spry.Utils.Notifier.call(this);

	this.reqInfo = reqInfo;
	this.rawData = null;
	this.timer = null;
	this.state = Spry.Data.HTTPSourceDataSet.LoadManager.CachedRequest.NOT_LOADED;
	this.xhRequestProcessor = xhRequestProcessor;
	this.sessionExpiredChecker = sessionExpiredChecker;
};

Spry.Data.HTTPSourceDataSet.LoadManager.CachedRequest.prototype = new Spry.Utils.Notifier();
Spry.Data.HTTPSourceDataSet.LoadManager.CachedRequest.prototype.constructor = Spry.Data.HTTPSourceDataSet.LoadManager.CachedRequest;

Spry.Data.HTTPSourceDataSet.LoadManager.CachedRequest.NOT_LOADED      = 1;
Spry.Data.HTTPSourceDataSet.LoadManager.CachedRequest.LOAD_REQUESTED  = 2;
Spry.Data.HTTPSourceDataSet.LoadManager.CachedRequest.LOAD_FAILED     = 3;
Spry.Data.HTTPSourceDataSet.LoadManager.CachedRequest.LOAD_SUCCESSFUL = 4;

Spry.Data.HTTPSourceDataSet.LoadManager.CachedRequest.prototype.loadDataCallback = function(req)
{
	if (req.xhRequest.readyState != 4)
		return;

	var rawData = null;
	if (this.xhRequestProcessor) rawData = this.xhRequestProcessor(req.xhRequest);

	if (this.sessionExpiredChecker)
	{
		Spry.Utils.setOptions(req, {'rawData': rawData}, false);
		if (this.sessionExpiredChecker(req))
		{
			this.state = Spry.Data.HTTPSourceDataSet.LoadManager.CachedRequest.LOAD_FAILED;
			this.notifyObservers("onRequestSessionExpired", req);
			this.observers.length = 0;
			return;
		}
	}

	if (!rawData)
	{
		this.state = Spry.Data.HTTPSourceDataSet.LoadManager.CachedRequest.LOAD_FAILED;
		this.notifyObservers("onRequestError", req);
		this.observers.length = 0; // Clear the observers list.
		return;
	}

	this.rawData = rawData;
	this.state = Spry.Data.HTTPSourceDataSet.LoadManager.CachedRequest.LOAD_SUCCESSFUL;

	// Notify all of the cached request's observers!
	this.notifyObservers("onRequestResponse", req);

	// Clear the observers list.
	this.observers.length = 0;
};

Spry.Data.HTTPSourceDataSet.LoadManager.CachedRequest.prototype.loadData = function()
{
	// IE will synchronously fire our loadDataCallback() during the call
	// to an async Spry.Utils.loadURL() if the data for the url is already
	// in the browser's local cache. This can wreak havoc with complicated master/detail
	// regions that use data sets that have master/detail relationships with other
	// data sets. Our data set logic already handles async data loading nicely so we
	// use a timer to fire off the async Spry.Utils.loadURL() call to insure that any
	// data loading happens asynchronously after this function is finished.

	var self = this;
	this.cancelLoadData();
	this.rawData = null;
	this.state = Spry.Data.HTTPSourceDataSet.LoadManager.CachedRequest.LOAD_REQUESTED;

	var reqInfo = this.reqInfo.clone();
	reqInfo.successCallback = function(req) { self.loadDataCallback(req); };
	reqInfo.errorCallback = reqInfo.successCallback;

	this.timer = setTimeout(function()
	{
		self.timer = null;
		Spry.Utils.loadURL(reqInfo.method, reqInfo.url, reqInfo.async, reqInfo.successCallback, reqInfo);
	}, 0);
};

Spry.Data.HTTPSourceDataSet.LoadManager.CachedRequest.prototype.cancelLoadData = function()
{
	if (this.state == Spry.Data.HTTPSourceDataSet.LoadManager.CachedRequest.LOAD_REQUESTED)
	{
		if (this.timer)
		{
			this.timer.clearTimeout();
			this.timer = null;
		}

		this.rawData = null;
		this.state = Spry.Data.HTTPSourceDataSet.LoadManager.CachedRequest.NOT_LOADED;
	}
};

Spry.Data.HTTPSourceDataSet.LoadManager.getCacheKey = function(reqInfo)
{
	return reqInfo.method + "::" + reqInfo.url + "::" + reqInfo.postData + "::" + reqInfo.username;
};

Spry.Data.HTTPSourceDataSet.LoadManager.loadData = function(reqInfo, ds, useCache)
{
	if (!reqInfo)
		return null;

	var cacheObj = null;
	var cacheKey = null;

	if (useCache)
	{
		cacheKey = Spry.Data.HTTPSourceDataSet.LoadManager.getCacheKey(reqInfo);
		cacheObj = Spry.Data.HTTPSourceDataSet.LoadManager.cache[cacheKey];
	}

	if (cacheObj)
	{
		if (cacheObj.state == Spry.Data.HTTPSourceDataSet.LoadManager.CachedRequest.LOAD_REQUESTED)
		{
			if (ds)
				cacheObj.addObserver(ds);
			return cacheObj;
		}
		else if (cacheObj.state == Spry.Data.HTTPSourceDataSet.LoadManager.CachedRequest.LOAD_SUCCESSFUL)
		{
			// Data is already cached so if we have a data set, trigger an async call
			// that tells it to load its data.
			if (ds)
				setTimeout(function() { ds.setDataFromDoc(cacheObj.rawData); }, 0);
			return cacheObj;
		}
	}

	// We're either loading this url for the first time, or an error occurred when
	// we last tried to load it, or the caller requested a forced load.

	if (!cacheObj)
	{
		cacheObj = new Spry.Data.HTTPSourceDataSet.LoadManager.CachedRequest(reqInfo, (ds ? ds.xhRequestProcessor : null), (ds ? ds.sessionExpiredChecker : null));

		if (useCache)
		{
			Spry.Data.HTTPSourceDataSet.LoadManager.cache[cacheKey] = cacheObj;

			// Add an observer that will remove the cacheObj from the cache
			// if there is a load request failure.
			cacheObj.addObserver({ onRequestError: function() { Spry.Data.HTTPSourceDataSet.LoadManager.cache[cacheKey] = undefined; }});
		}
	}

	if (ds)
		cacheObj.addObserver(ds);

	cacheObj.loadData();

	return cacheObj;
};

Spry.Data.HTTPSourceDataSet.LoadManager.cancelLoadData = function(cacheObj, ds)
{
	if (cacheObj)
	{
		if (ds)
			cacheObj.removeObserver(ds);
		else
			cacheObj.cancelLoadData();
	}
};

*/