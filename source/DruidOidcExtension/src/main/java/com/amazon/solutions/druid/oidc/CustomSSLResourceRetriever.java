/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

package com.amazon.solutions.druid.oidc;


import com.google.common.primitives.Ints;
import com.nimbusds.jose.util.DefaultResourceRetriever;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLSocketFactory;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;


/**
 * This class exists only to enable use of custom SSLSocketFactory on top of builtin class. This could be removed
 * when same functionality has been added to original class com.nimbusds.jose.util.DefaultResourceRetriever.
 */
public class CustomSSLResourceRetriever extends DefaultResourceRetriever
{
  private SSLSocketFactory sslSocketFactory;

  public CustomSSLResourceRetriever(long readTimeout, SSLSocketFactory sslSocketFactory)
  {
    // super(..) has to be the very first statement in constructor.
    super(Ints.checkedCast(readTimeout), Ints.checkedCast(readTimeout));

    this.sslSocketFactory = sslSocketFactory;
  }

  @Override
  protected HttpURLConnection openConnection(final URL url) throws IOException
  {
    HttpURLConnection con = super.openConnection(url);

    if (sslSocketFactory != null && con instanceof HttpsURLConnection) {
      ((HttpsURLConnection) con).setSSLSocketFactory(sslSocketFactory);
    }

    return con;
  }
}
